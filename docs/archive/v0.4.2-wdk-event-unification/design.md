# 설계 - v0.4.2

## 변경 규모
**규모**: 일반 기능
**근거**: 3개 패키지 수정(guarded-wdk, daemon, protocol), broker API 시그니처 변경, wire protocol 변경(EventStreamEvent 타입화, ControlResult approval forward 제거), 신규 파일(events.ts)

---

## 문제 요약
daemon→app 이벤트 경로에서 ControlResult와 WDK 이벤트가 중복(6쌍). WDK 이벤트 payload가 unknown. daemon이 broker 우회하여 store 직접 접근. 이 3가지를 해결하여 WDK 이벤트를 단일 경로 + 타입 안전 + 원자적으로 만든다.

> 상세: [README.md](README.md) 참조

## 사전 발견: Dual Emitter 버그

설계 탐색 중 **기존 이벤트 전달이 이미 깨져있는 버그**를 발견했다.

```
daemon/wdk-host.ts:
  ① const emitter = new EventEmitter()          ← daemon이 만든 emitter
  ② broker = new SignedApprovalBroker(..., emitter)  ← 이 emitter로 broker 생성

  ③ wdk = await createGuardedWDK({
       approvalBroker: null,                     ← broker를 전달하지 않음!
       ...
     })

guarded-wdk-factory.ts:
  ④ const emitter = new EventEmitter()          ← factory가 별도 emitter 생성
  ⑤ approvalBroker = new SignedApprovalBroker(..., emitter)  ← 두 번째 broker

  ⑥ on(type, handler) { emitter.on(type, handler) }  ← factory의 emitter만 구독
```

결과:
- daemon이 사용하는 broker(②)는 daemon의 emitter(①)에 이벤트 발행
- `wdk.on()`(⑥)은 factory의 emitter(④)만 구독
- **broker 이벤트(ApprovalVerified, PolicyApplied 등)가 wdk.on()에 도달하지 않음**
- middleware 이벤트(IntentProposed, PolicyEvaluated 등)는 factory emitter(④)를 사용하므로 정상 전달
- ControlResult가 유일한 approval 피드백 경로였던 이유가 이것

이 Phase에서 반드시 수정해야 한다.

## 접근법

**Single Emitter Owned by Factory**:

daemon의 wdk-host에서 emitter/broker를 직접 생성하지 않고, factory에게 위임. daemon은 `wdk.getApprovalBroker()`로 broker를 얻음. factory 내부의 단일 emitter가 broker + middleware 모든 이벤트를 발행.

## 대안 검토

### Emitter 통합 방식

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 외부 broker를 factory에 주입 | wdk-host 변경 최소 | emitter가 여전히 2개 (daemon용 + factory 내부 middleware용). 병합 필요 | ❌ |
| B: factory가 emitter+broker 소유 | emitter 1개. `wdk.on()`이 모든 이벤트 수신. Clean ownership | mock WDK가 실제 emitter 필요 | ✅ |
| C: 공유 Event Bus 모듈 | 최대 디커플링 | Primitive First 위반. 새 추상화. 테스트 시 싱글턴 충돌 | ❌ |

**선택 이유**: B — emitter 소유자가 factory 1곳. `wdk.on()` 하나로 모든 이벤트(broker + middleware) 수신. 새 추상화 없이 기존 구조의 배선만 수정.

### ApprovalFailed 범위

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: verifyApproval 실패만 | 범위 명확 | 후처리 실패 시 앱에 신호 없음 | ❌ |
| B: broker.submitApproval 전체 실패 | 후처리를 broker에 내재화하면 모든 실패를 커버 | ApprovalVerified 발행 시점 조정 필요 | ✅ |

### 이벤트 발행 원자성

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 기존 유지 (ApprovalVerified 먼저, 도메인 이벤트 나중) | 변경 없음 | 후처리 실패 시 ApprovalVerified만 발행되고 도메인 이벤트 없음. 비대칭 | ❌ |
| B: 전부 끝난 후 한꺼번에 발행 | 원자적. 성공: 도메인이벤트+ApprovalVerified. 실패: ApprovalFailed만 | emit 순서 변경 | ✅ |

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| Emitter 소유자 | factory 단독 | wdk-host에서 emitter/broker 생성 제거. factory가 유일한 소유자 |
| Broker 획득 | `wdk.getApprovalBroker()` | daemon이 factory 산출물 사용 |
| Event 타입 정의 위치 | `protocol/src/events.ts` (신규) | wire boundary에 위치. guarded-wdk가 이 타입에 맞춰 emit. protocol → guarded-wdk 역방향 의존 방지 |
| Base interface | `WDKEventBase { type: string; timestamp: number }` | 모든 이벤트가 공유하는 필드 |
| Event union | `AnyWDKEvent = PendingPolicyRequestedEvent \| ...` (14종) | 타입 안전한 discriminated union |
| ApprovalFailed 범위 | broker.submitApproval 전체 | 검증 + 후처리 실패 모두 포함 |
| 이벤트 발행 시점 | 도메인 처리 후 best-effort | try { 검증→도메인→히스토리 } catch { emit(ApprovalFailed) }; 밖에서 best-effort emit(성공이벤트) |
| savePolicy 전달 | ApprovalSubmitContext discriminated union | `{ kind: 'policy_approval', policies, description }` — No Optional 준수 |
| setTrustedApprovers | broker 내부 자동 수행 | device_revoke 후 broker가 자체적으로 listSigners→setTrustedApprovers |
| ControlResult forward | 승인 6종: 제거. cancel 2종: 유지 | handleControlMessage가 승인 시 null 반환, index.ts가 null이면 forward skip |
| RELAY_EVENTS | ApprovalFailed 추가 (13→14종) | PollingError는 유지 안 함 (내부 디버깅용) |
| EventStreamEvent.eventName | 제거. `event.type`이 유일한 source of truth | eventName + event.type 중복 제거 |
| Mock WDK | 실제 EventEmitter + broker 내장 | mock에서도 on()/off()가 동작해야 이벤트 포워딩 테스트 가능 |

---

## 범위 / 비범위

**범위(In Scope):**
- guarded-wdk: events.ts 신규, broker에 savePolicy/setTrustedApprovers 내재화, ApprovalFailed emit, 원자적 발행
- daemon: wdk-host dual emitter 수정, control-handler 단순화, ControlResult forward 제거(승인 6종), RELAY_EVENTS에 ApprovalFailed 추가
- protocol: EventStreamEvent payload 타입화

**비범위(Out of Scope):**
- app의 sendApproval() 리스너 변경 (app 별도 Phase)
- cancel_queued/cancel_active ControlResult 변경
- PollingError 이벤트 처리
- 개별 도메인 실패 이벤트 세분화 (PolicyApplyFailed 등)

## 아키텍처 개요

### Before (현재)

```
[App] ──승인──→ [Daemon control-handler]
                     │
                     ├─ broker.submitApproval()
                     │    ├─ verifyApproval()
                     │    ├─ emit ApprovalVerified  ← daemon emitter (①)
                     │    ├─ domain ops
                     │    └─ emit PolicyApplied     ← daemon emitter (①)
                     │                                  ↑ wdk.on()이 못 봄!
                     │
                     ├─ approvalStore.savePolicy()  ← store 직접 접근
                     ├─ broker.setTrustedApprovers() ← broker 직접 조작
                     │
                     ├─ return ControlResult { ok:true } ──→ relay ──→ App ← 경로 1
                     │
                     └─ (WDK 이벤트는 wdk.on()에 안 도달)            ← 경로 2 (깨짐)
```

### After (변경 후)

```
[App] ──승인──→ [Daemon control-handler]
                     │
                     └─ broker.submitApproval(signedApproval, context)
                          │
                          ├─ verifyApproval()
                          ├─ domain ops (savePolicy 포함)
                          ├─ setTrustedApprovers (device_revoke 시)
                          ├─ record history
                          │
                          ├─ 성공: emit ApprovalVerified + PolicyApplied
                          │        → factory emitter → wdk.on() → relay → App
                          │
                          └─ 실패: emit ApprovalFailed
                                   → factory emitter → wdk.on() → relay → App

                     (ControlResult는 앱에 안 감. daemon 내부 로깅만)
```

## 데이터 흐름

### submitApproval 내부 (변경 후)

```
submitApproval(signedApproval, context: ApprovalSubmitContext):
  pendingEvents = []

  // ── 원자성 경계 시작 (도메인 처리) ──
  try {
    ① verifyApproval(signedApproval, trustedApprovers, store, context)
    ② switch(type):
         'policy_approval': removePending → savePolicy(context.policies) → pendingEvents.push(PolicyApplied)
         'policy_reject':   removePending → pendingEvents.push(ApprovalRejected)
         'device_revoke':   revokeSigner → setTrustedApprovers → pendingEvents.push(SignerRevoked)
         'wallet_create':   createWallet + removePending → pendingEvents.push(WalletCreated)
         'wallet_delete':   deleteWallet + removePending → pendingEvents.push(WalletDeleted)
         'tx':              (no domain op)
    ③ appendHistory(...)
  catch (err):
    ④ emit(ApprovalFailed, { requestId, approvalType, error: err.message })
       throw err
  // ── 원자성 경계 끝 ──

  // ── best-effort emit (경계 밖, 리스너 예외는 삼킴) ──
  try {
    ⑤ emit(ApprovalVerified, ...)
       for (e of pendingEvents) emit(e)
  } catch (emitErr) {
    // 리스너 예외는 로깅만. caller에 전파하지 않음.
    log.error(emitErr)
  }
```

## API/인터페이스 계약

### ApprovalSubmitContext (신규, guarded-wdk)

```typescript
type ApprovalSubmitContext =
  | { kind: 'tx'; expectedTargetHash: string }
  | { kind: 'policy_approval'; expectedTargetHash: string; policies: unknown[]; description: string }
  | { kind: 'policy_reject' }
  | { kind: 'device_revoke'; expectedTargetHash: string }
  | { kind: 'wallet_create' }
  | { kind: 'wallet_delete' }
```

### WDKEventBase + 14종 이벤트 (신규, protocol/src/events.ts)

```typescript
interface WDKEventBase {
  type: string
  timestamp: number
}

interface ApprovalVerifiedEvent extends WDKEventBase {
  type: 'ApprovalVerified'
  requestId: string
  approvalType: string
  approver: string
}

interface ApprovalFailedEvent extends WDKEventBase {
  type: 'ApprovalFailed'
  requestId: string
  approvalType: string
  error: string
}

// ... 13종 추가

type AnyWDKEvent = ApprovalVerifiedEvent | ApprovalFailedEvent | PolicyAppliedEvent | ...
```

### EventStreamEvent (변경, protocol)

```typescript
// Before
export interface EventStreamEvent {
  type: 'event_stream'
  eventName: string
  event: unknown
}

// After — eventName 제거, event.type이 source of truth
import type { AnyWDKEvent } from './events.js'

export interface EventStreamEvent {
  type: 'event_stream'
  event: AnyWDKEvent    // event.type으로 이벤트 종류 판별
}
```

### handleControlMessage 반환 (변경, daemon)

```typescript
// Before: 모든 타입이 ControlResult 반환 → relay forward
// After: 승인 6종은 null 반환 → relay forward skip
async function handleControlMessage(...): Promise<ControlResult | null> {
  // 승인 타입: broker.submitApproval() 호출 → null 반환
  // cancel 타입: 기존대로 ControlResult 반환
}
```

## 테스트 전략

| 레벨 | 범위 | 방법 |
|------|------|------|
| Unit | broker.submitApproval 원자적 emit | Jest mock emitter — 성공 시 ApprovalVerified+도메인이벤트, 실패 시 ApprovalFailed만 |
| Unit | broker.submitApproval에서 savePolicy 호출 | Jest mock store — policy 타입 시 savePolicy 호출 확인 |
| Unit | broker.submitApproval에서 setTrustedApprovers | device_revoke 시 자동 호출 확인 |
| Unit | ApprovalSubmitContext 각 kind별 | 6종 context kind에 대한 정상/실패 테스트 |
| Unit | WDK 이벤트 타입 | TypeScript 컴파일 통과 (tsc --noEmit) |
| Integration | control-handler → broker → event_stream | 승인 메시지 → broker 호출 → 이벤트 발행 → relay forward 확인 |
| Integration | ControlResult forward 제거 확인 | 승인 6종 → null 반환 → relay에 ControlResult 안 감 |

## 실패/에러 처리

| 시나리오 | 처리 |
|---------|------|
| verifyApproval 실패 (서명 검증) | emit(ApprovalFailed) → throw → daemon 로깅 |
| 도메인 작업 실패 (savePolicy, revokeSigner) | emit(ApprovalFailed) → throw → daemon 로깅 |
| history 기록 실패 | 원자성 경계 **안**. emit 전에 history 기록 → 실패 시 ApprovalFailed 발행. 도메인 상태는 변경되었으나 기록 안 됨 (로그로 보완) |
| emitter.emit 자체 실패 (리스너 예외) | 원자성 경계 **밖**. emit은 도메인 처리 완료 후 발생. 리스너 버그는 broker 책임 아님. 리스너에서 try/catch 권장 |

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| Dual emitter 수정이 기존 middleware 이벤트에 영향 | middleware 이벤트(IntentProposed 등)가 factory emitter 사용 — wdk-host 변경은 영향 없음 | factory 내부 코드 미변경 확인 |
| App의 sendApproval()이 ControlResult 대기 | 이 Phase에서 ControlResult를 끊으면 app이 timeout | 비범위로 분리. app Phase에서 ApprovalVerified/ApprovalFailed 리스너로 교체 |
| trustedApprovers 빈 배열로 부팅 | factory가 빈 배열 허용해야 함 | factory 코드 확인 — 현재도 빈 배열 허용함 |
| submitApproval 시그니처 변경으로 테스트 깨짐 | control-handler.test.ts 15건 mock 수정 필요 | 티켓에 포함 |
| Mock WDK에 실제 emitter 필요 | createMockWDK의 on()이 no-op → 이벤트 포워딩 불가 | mock에 EventEmitter + broker 내장 |
