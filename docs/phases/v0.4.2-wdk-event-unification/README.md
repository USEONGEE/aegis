# WDK 이벤트 단일화 + 타입 규격화 - v0.4.2

## 문제 정의

### 현상

3가지 문제가 동시에 존재한다.

**문제 1: ControlResult / WDK 이벤트 중복 전달 (6쌍)**

App이 승인(policy_approval, tx_approval 등)을 보내면 daemon→app으로 같은 결과가 두 번 전달된다:
1. **ControlResult** `{ ok:true, type:'policy_approval', requestId }` — daemon의 handleControlMessage 반환값
2. **WDK 이벤트** `{ type:'event_stream', eventName:'PolicyApplied', event }` — broker.submitApproval 성공 시 WDK EventEmitter 발행

중복 6쌍:

| ControlResult | WDK 이벤트 | 트리거 |
|---------------|-----------|--------|
| `{ ok:true, type:'tx_approval' }` | `ApprovalVerified` | tx 승인 |
| `{ ok:true, type:'policy_approval' }` | `PolicyApplied` + `ApprovalVerified` | 정책 승인 |
| `{ ok:true, type:'policy_reject' }` | `ApprovalRejected` | 정책 거부 |
| `{ ok:true, type:'device_revoke' }` | `SignerRevoked` | 서명자 해제 |
| `{ ok:true, type:'wallet_create' }` | `WalletCreated` | 지갑 생성 |
| `{ ok:true, type:'wallet_delete' }` | `WalletDeleted` | 지갑 삭제 |

비대칭: 성공 시 2개 신호, 실패 시 ControlResult만 (WDK 이벤트 없음).

**문제 2: WDK 이벤트 타입 규격 부재**

13종 이벤트가 모두 `unknown`으로 전달:

```typescript
// 현재: payload가 unknown
wdk.on('PolicyApplied', (event: unknown) => {
  relayClient.send('control', { type: 'event_stream', eventName, event })
})
```

**문제 3: Daemon이 WDK를 우회하여 store에 직접 접근**

`handleControlMessage`에서 `broker.submitApproval()` 성공 후 daemon이 store에 직접 후처리:

```typescript
// control-handler.ts:117-124 — daemon이 store 직접 접근 (WDK 우회)
await broker.submitApproval(signedApproval, context)   // WDK 경유
await approvalStore.savePolicy(...)                     // WDK 우회 ← 레이어 위반
```

```typescript
// control-handler.ts:172-178 — daemon이 broker 상태 직접 조작
await broker.submitApproval(signedApproval, context)   // WDK 경유
const signers = await approvalStore.listSigners()       // WDK 우회 ← 레이어 위반
broker.setTrustedApprovers(active)                      // broker 직접 조작 ← 레이어 위반
```

위반 목록:
- `policy_approval`: daemon이 `approvalStore.savePolicy()` 직접 호출
- `device_revoke`: daemon이 `approvalStore.listSigners()` + `broker.setTrustedApprovers()` 직접 조작
- `pairing_confirm` (v0.3.4에서 제거 예정): daemon이 `approvalStore.saveSigner()` + `broker.setTrustedApprovers()` 직접 조작

### 원인

1. **이중 경로**: handleControlMessage가 ControlResult를 반환 + broker.submitApproval이 WDK 이벤트를 발행 → daemon이 둘 다 relay로 전송
2. **비대칭 실패**: 성공 시 2개 신호, 실패 시 ControlResult만 → 앱이 성공/실패를 다른 채널로 받아야 함
3. **타입 부재**: guarded-wdk의 EventEmitter가 이벤트 payload 타입을 정의하지 않음
4. **broker 책임 누락**: broker.submitApproval()이 검증만 하고 후처리(savePolicy, setTrustedApprovers)를 daemon에게 떠넘김 → daemon이 store에 직접 접근하는 레이어 위반 발생

### 영향

1. **앱 혼란**: 같은 결과를 2번 수신
2. **비대칭 에러 처리**: 성공은 WDK 이벤트로, 실패는 ControlResult로
3. **타입 불안전**: WDK 이벤트 payload가 unknown
4. **이벤트-상태 불일치**: WDK가 `PolicyApplied` 발행 → daemon의 `savePolicy` 실패 → 이벤트와 실제 상태 불일치
5. **레이어 위반**: daemon(Layer 3)이 store(Layer 1 내부)에 직접 접근. "WDK가 source of truth" 원칙 위반

### 목표

1. **ControlResult 앱 전송 제거 (승인 6종만)**: daemon의 handleControlMessage 반환값 중 승인 계열(tx_approval, policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete)을 relay로 forward하지 않음. `cancel_queued`/`cancel_active` 응답은 현행 유지
2. **WDK 실패 이벤트 추가**: `ApprovalFailed` 이벤트를 guarded-wdk에 추가. 범위: `verifyApproval` 실패(서명 검증 실패)만. 검증 후 도메인 작업 실패, daemon 후처리 실패는 별도 이벤트(필요 시 추후 추가)
3. **WDK 이벤트 타입 규격화**: 13종 기존 이벤트 + 1종 신규(ApprovalFailed) = 14종에 공통 base interface + 개별 payload 타입 정의
4. **daemon store 직접 접근 제거**: savePolicy, setTrustedApprovers 등 후처리를 broker 내부로 이동. daemon은 `broker.submitApproval()` 하나만 호출
5. 변경 후: daemon→app 이벤트 경로가 **단일 경로, 대칭적** (성공도 실패도 WDK 이벤트) + daemon은 WDK facade만 사용

### 비목표 (Out of Scope)

- ControlResult 타입 자체 제거 (daemon 내부 로깅/디버깅용으로 유지)
- `cancel_queued`/`cancel_active` ControlResult 변경 (WDK 이벤트 아님, daemon 큐 관리 기능)
- chat 채널의 tool_start/tool_done/stream/done 메시지 변경 (WDK 이벤트와 무관)
- 기존 13종 WDK 이벤트의 payload 내용 변경 (타입 정의만 추가, 구조는 현행 유지)
- 도메인 작업 실패 이벤트 (PolicyApplyFailed 등) — 필요 시 후속 Phase
- v0.4.0 범위의 ControlResult discriminated union 리팩토링 — 그 Phase에서 처리

## 사용자 확정 결정사항

- **WDK 이벤트를 살린다** (ControlResult가 아님). 이유: WDK가 source of truth이므로 코어 이벤트가 정보의 출처여야 함
- **ApprovalFailed 이벤트를 guarded-wdk에 추가**한다 (ControlResult의 에러 전달 역할 대체). 범위: verifyApproval 실패만
- **WDK 이벤트 타입을 공통 규격**으로 정의한다 (`WDKEvent<T, P>` base interface)
- **ControlResult forward 제거는 승인 6종만**. cancel_queued/cancel_active는 현행 유지 (WDK 이벤트 아님)
- **daemon의 store 직접 접근을 broker 내부로 이동**한다. savePolicy, setTrustedApprovers를 broker.submitApproval 내부에서 처리

## 14종 WDK 이벤트 목록

| # | 이벤트명 | 카테고리 | 신규/기존 |
|---|---------|----------|----------|
| 1 | IntentProposed | tx lifecycle | 기존 |
| 2 | PolicyEvaluated | tx lifecycle | 기존 |
| 3 | ExecutionBroadcasted | tx lifecycle | 기존 |
| 4 | ExecutionSettled | tx lifecycle | 기존 |
| 5 | ExecutionFailed | tx lifecycle | 기존 |
| 6 | TransactionSigned | tx lifecycle | 기존 |
| 7 | PendingPolicyRequested | approval | 기존 |
| 8 | ApprovalVerified | approval | 기존 |
| 9 | ApprovalRejected | approval | 기존 |
| 10 | PolicyApplied | approval | 기존 |
| 11 | SignerRevoked | identity | 기존 |
| 12 | WalletCreated | identity | 기존 |
| 13 | WalletDeleted | identity | 기존 |
| 14 | **ApprovalFailed** | **approval** | **신규** |

## 제약사항

- v0.4.0 완료 후 진행 (ControlResult, handleControlMessage optional deps가 v0.4.0에서 정리됨). 설계 문서 작성은 허용, 구현 착수만 차단
- Breaking change 허용 (monorepo 내부 원샷 변경)
- guarded-wdk, daemon 2개 패키지 수정 (protocol은 검토 후 결정)

## 패키지별 영향 분석

| 패키지 | IN/OUT | 영향 |
|--------|--------|------|
| **guarded-wdk** | IN | broker에 savePolicy/setTrustedApprovers 후처리 내재화 + ApprovalFailed emit + 14종 이벤트 타입 정의 + EventEmitter 타입 안전화 |
| **daemon** | IN | ControlResult relay forward 제거 (승인 6종) + store 직접 접근 코드 제거 + WDK 이벤트 수신부 타입 적용 |
| **protocol** | 검토 필요 | event_stream 관련 타입이 있으면 수정 |
| **app** | OUT (이번 범위 밖) | WDK 이벤트 타입 소비는 app 별도 Phase에서 |

## 참조

- Daemon 도메인 분석: `docs/report/daemon-domain-aggregate-analysis.md`
- Relay 도메인 분석: `docs/report/relay-domain-aggregate-analysis.md`
- v0.4.0 Phase: `docs/phases/v0.4.0-no-optional-cleanup/`
