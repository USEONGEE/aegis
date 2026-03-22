# WDK 이벤트 단일화 + 타입 규격화 - v0.4.2

## 문제 정의

### 현상

daemon→app 방향의 control 채널에서 **같은 결과가 두 번** 전달된다.

App이 승인(policy_approval, tx_approval 등)을 보내면:
1. **ControlResult** `{ ok:true, type:'policy_approval', requestId }` — daemon의 handleControlMessage 반환값
2. **WDK 이벤트** `{ type:'event_stream', eventName:'PolicyApplied', event }` — broker.submitApproval 성공 시 WDK EventEmitter 발행

6쌍의 중복:

| ControlResult | WDK 이벤트 | 트리거 |
|---------------|-----------|--------|
| `{ ok:true, type:'tx_approval' }` | `ApprovalVerified` | tx 승인 |
| `{ ok:true, type:'policy_approval' }` | `PolicyApplied` + `ApprovalVerified` | 정책 승인 |
| `{ ok:true, type:'policy_reject' }` | `ApprovalRejected` | 정책 거부 |
| `{ ok:true, type:'device_revoke' }` | `SignerRevoked` | 서명자 해제 |
| `{ ok:true, type:'wallet_create' }` | `WalletCreated` | 지갑 생성 |
| `{ ok:true, type:'wallet_delete' }` | `WalletDeleted` | 지갑 삭제 |

추가 문제: WDK 이벤트에 **타입 규격이 없다.** 모든 이벤트가 `unknown`으로 전달되어 앱에서 타입 안전하게 소비할 수 없다.

```typescript
// 현재: payload가 unknown
wdk.on('PolicyApplied', (event: unknown) => {
  relayClient.send('control', { type: 'event_stream', eventName, event })
})
```

### 원인

1. **이중 경로**: handleControlMessage가 ControlResult를 반환 + broker.submitApproval이 WDK 이벤트를 발행 → daemon이 둘 다 relay로 전송
2. **비대칭 실패**: 성공 시 2개 신호, 실패 시 ControlResult만 (WDK 이벤트 없음) → 앱이 성공/실패를 다른 채널로 받아야 함
3. **타입 부재**: guarded-wdk의 EventEmitter가 이벤트 payload 타입을 정의하지 않음. 13종 이벤트가 각각 다른 형태이나 `unknown`으로 전달

### 영향

1. **앱 혼란**: 같은 결과를 2번 수신. 어느 것을 기준으로 UI를 업데이트해야 하는지 불명확
2. **비대칭 에러 처리**: 성공은 WDK 이벤트로, 실패는 ControlResult로 → 앱이 두 채널을 모두 감시해야 함
3. **타입 불안전**: WDK 이벤트 payload가 unknown → 런타임 형변환 필요, 잘못된 필드 접근 가능
4. **WDK가 source of truth인데 daemon이 래핑**: 핵심 도메인 이벤트(WDK)보다 인프라 래핑(ControlResult)이 먼저 도착할 수 있음

### 목표

1. **ControlResult 앱 전송 제거**: daemon의 handleControlMessage 반환값을 relay로 forward하지 않음. WDK 이벤트만 앱에 전달
2. **WDK 실패 이벤트 추가**: `ApprovalFailed` 이벤트를 guarded-wdk에 추가하여 성공/실패가 모두 WDK 이벤트 단일 경로로 전달
3. **WDK 이벤트 타입 규격화**: 13종 기존 이벤트 + 1종 신규(ApprovalFailed) = 14종 이벤트에 대해 공통 base interface + 개별 payload 타입 정의
4. 변경 후 daemon→app 이벤트 경로가 **단일 경로, 대칭적** (성공도 실패도 WDK 이벤트)

### 비목표 (Out of Scope)

- ControlResult 타입 자체 제거 (daemon 내부 로깅/디버깅용으로 유지)
- chat 채널의 tool_start/tool_done/stream/done 메시지 변경 (WDK 이벤트와 무관)
- 기존 13종 WDK 이벤트의 payload 내용 변경 (타입 정의만 추가, 구조는 현행 유지)
- v0.4.0 (No Optional) 범위의 ControlResult discriminated union 리팩토링 — 그 Phase에서 처리

## 사용자 확정 결정사항

- **WDK 이벤트를 살린다** (ControlResult가 아님). 이유: WDK가 source of truth이므로 코어 이벤트가 정보의 출처여야 함
- **ApprovalFailed 이벤트를 guarded-wdk에 추가**한다 (ControlResult의 에러 전달 역할 대체)
- **WDK 이벤트 타입을 공통 규격**으로 정의한다 (`WDKEvent<T, P>` base interface)

## 제약사항

- v0.4.0 완료 후 진행 (ControlResult, handleControlMessage optional deps가 v0.4.0에서 정리됨)
- Breaking change 허용 (monorepo 내부 원샷 변경)
- guarded-wdk, daemon, (protocol) 3개 패키지 수정

## 패키지별 영향 분석

| 패키지 | IN/OUT | 영향 |
|--------|--------|------|
| **guarded-wdk** | IN | ApprovalFailed 이벤트 추가 + 14종 이벤트 타입 정의 + EventEmitter 타입 안전화 |
| **daemon** | IN | index.ts에서 ControlResult relay forward 제거 + WDK 이벤트 수신부 타입 적용 |
| **protocol** | 검토 필요 | event_stream 관련 타입이 있으면 수정 |
| **app** | OUT (이번 범위 밖) | WDK 이벤트 타입 소비는 app 별도 Phase에서 |

## 참조

- Daemon 도메인 분석: `docs/report/daemon-domain-aggregate-analysis.md`
- Relay 도메인 분석: `docs/report/relay-domain-aggregate-analysis.md`
- v0.4.0 Phase: `docs/phases/v0.4.0-no-optional-cleanup/`
