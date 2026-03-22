# App WDK 이벤트 마이그레이션 - v0.4.4

## 문제 정의

### 현상

v0.4.2에서 daemon→app 이벤트 경로를 단일화(WDK 이벤트 전용)했으나, app 쪽 코드가 아직 이전 방식을 사용하고 있어 3가지 호환성 문제가 발생한다.

**문제 1: sendApproval()이 ControlResult를 기대 — 전체 승인 6종 깨짐**

`RelayClient.sendApproval()`이 daemon의 `approval_result`/`approval_error` 응답을 대기한다. v0.4.2에서 승인 6종의 ControlResult forward를 제거했으므로, 모든 승인 타입이 60초 타임아웃으로 실패한다.

영향받는 승인 타입 전체:
- tx_approval → 기대: approval_result (도착 안 함)
- policy_approval → 기대: approval_result (도착 안 함)
- policy_reject → 기대: approval_result (도착 안 함)
- device_revoke → 기대: approval_result (도착 안 함)
- wallet_create → 기대: ok:true (도착 안 함)
- wallet_delete → 기대: ok:true (도착 안 함)

**문제 2: event_stream에서 eventName 참조 (제거됨)**

DashboardScreen과 SettingsScreen이 `data.eventName`을 참조하지만, v0.4.2에서 `eventName` 필드를 제거하고 `event.type`으로 대체했다.

**문제 3: WDK 이벤트 자동 소비 부재**

`useActivityStore`가 WDK 이벤트에서 자동으로 populate되지 않는다. ApprovalFailed도 activity에 포함되어야 하지만 현재 `ActivityEventType`에 없다.

### 원인

v0.4.2가 daemon/protocol 측만 변경하고 app은 비범위로 분리한 결과.

### 영향

1. 승인 플로우 완전 깨짐: 모든 승인 타입이 60초 후 타임아웃 에러
2. 대시보드에서 실시간 잔액/포지션 업데이트 안 됨 (eventName 참조 실패)
3. 설정에서 서명자 해제 후 목록 갱신 안 됨

### 목표

1. **sendApproval()을 WDK 이벤트 기반으로 전환**: 승인 type별로 대응하는 WDK 이벤트를 수신하여 resolve/reject

   | 승인 타입 | 성공 이벤트 | 실패 이벤트 | resolve 근거 |
   |-----------|-----------|-----------|------------|
   | tx_approval | ExecutionBroadcasted | ApprovalFailed | hash+fee 포함. 브로드캐스트 완료 시점에 반환 |
   | policy_approval | PolicyApplied | ApprovalFailed | 정책 반영 완료 |
   | policy_reject | ApprovalRejected | ApprovalFailed | 거부 처리 완료 |
   | device_revoke | SignerRevoked | ApprovalFailed | 서명자 해제 완료 |
   | wallet_create | WalletCreated | ApprovalFailed | 지갑 생성 완료 |
   | wallet_delete | WalletDeleted | ApprovalFailed | 지갑 삭제 완료 |

2. **sendApproval() 반환값 유지**: `{ txHash }` 그대로. tx_approval은 ExecutionBroadcasted.hash에서 추출. non-tx 승인은 빈 문자열.

3. **eventName → event.type 마이그레이션**: DashboardScreen, SettingsScreen에서 `data.eventName` 대신 `data.event.type` 사용

4. **Activity 이벤트 기록**: RootNavigator syncHandler에서 event_stream → useActivityStore.addEvent(). ApprovalFailed를 ActivityEventType에 추가. 화면별 listener는 유지 (eventName → event.type 수정만).

### 비목표 (Out of Scope)

- useApprovalStore의 자동 populate (pending approval 생성은 daemon의 PendingPolicyRequested 이벤트로 하는 것이 맞지만, 현재 플로우가 수동이므로 별도 Phase)
- 새로운 UI 컴포넌트 추가
- daemon/protocol 코드 변경 (v0.4.2에서 완료)

## 사용자 확정 결정사항

- sendApproval()의 성공 기준은 approval type별 WDK 이벤트 매핑 (위 표). tx는 ExecutionBroadcasted (hash 포함)
- sendApproval() 반환값 `{ txHash }` 유지. non-tx 승인은 빈 문자열
- 화면별 event_stream listener 유지 (eventName → event.type 수정만). 중앙 소비로의 전환은 후속
- ApprovalFailed는 store 적재만 (화면 표시는 후속)

## 제약사항

- v0.4.2 완료 전제
- app만 수정 (packages/app)
- Breaking change 허용

## 패키지별 영향 분석

| 패키지 | IN/OUT | 영향 |
|--------|--------|------|
| **app** | IN | RelayClient.sendApproval() 이벤트 전환 (반환값 유지), Screen eventName→event.type, syncHandler activity 기록 추가, ActivityEventType에 ApprovalFailed 추가 (store 적재만) |
| daemon | OUT | 변경 없음 |
| protocol | OUT | 변경 없음 |

## 참조

- v0.4.2 Phase: `docs/phases/v0.4.2-wdk-event-unification/`
