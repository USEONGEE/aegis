# Dead Exports 전체 분류 + 원인 분석

> CI `cross/dead-exports` 126건을 3개 카테고리로 분류

---

## 요약

| 카테고리 | 건수 | 설명 |
|----------|------|------|
| **A — 진짜 dead** | 37 | export 키워드 제거 또는 삭제 대상 |
| **B — 타입 gap** | 28 | 런타임 사용 중이나 소비자가 타입 미참조 |
| **C — 공개 API** | 61 | index.ts re-export 유지 대상 |

### 패키지별 분포

| 패키지 | A | B | C | 합계 |
|--------|---|---|---|------|
| guarded-wdk | 5 | 0 | 12 | 17 |
| canonical | 0 | 0 | 3 | 3 |
| daemon | 16 | 16 | 0 | 32 |
| relay | 2 | 8 | 0 | 10 |
| protocol | 0 | 2 | 37 | 39 |
| manifest | 0 | 0 | 9 | 9 |
| app | 14 | 2 | 0 | 16 |
| **합계** | **37** | **28** | **61** | **126** |

---

## A — 진짜 dead (37건)

export 키워드 제거 또는 심볼 삭제 가능. 삭제 전 테스트 실행 필수.

### guarded-wdk (5건)

| 심볼 | 파일 | 사유 |
|------|------|------|
| `InMemoryApprovalBroker` | approval-broker.js:5 | `SignedApprovalBroker`로 대체됨. 어디서도 import 없음 |
| `evaluatePolicy` | guarded-middleware.ts:221 | index.ts 미포함. 내부 + 자체 테스트에서만 사용 |
| `CallPolicy` | guarded-middleware.ts:30 | index.ts 미포함. `Policy` 유니온 내부용 |
| `TimestampPolicy` | guarded-middleware.ts:35 | index.ts 미포함. `Policy` 유니온 내부용 |
| `GuardedAccount` | guarded-middleware.ts:70 | index.ts 미포함. 내부 함수 파라미터용 |

### daemon (16건)

| 심볼 | 파일 | 사유 |
|------|------|------|
| `CronBase` | cron-scheduler.ts:7 | `CronEntry`/`CronRegistration`/`CronListItem` 기반 타입. 같은 파일 내부용 |
| `CronEntry` | cron-scheduler.ts:16 | 내부 `Map<string, CronEntry>`용. 외부 import 없음 |
| `CancelResultOk` | message-queue.ts:15 | `CancelResult` 유니온 멤버. 같은 파일 내부용 |
| `CancelResultFailed` | message-queue.ts:20 | `CancelResult` 유니온 멤버. 같은 파일 내부용 |
| `QueueLogger` | message-queue.ts:34 | 내부 `_logger` 필드 타입. 외부 import 없음 |
| `MessageQueueOptions` | message-queue.ts:39 | 생성자 파라미터. 호출자는 구조적 매칭 |
| `SessionMessageQueue` | message-queue.ts:45 | `MessageQueueManager` 내부에서만 인스턴스화. 테스트만 import |
| `ToolCall` | openclaw-client.ts:16 | openclaw-client.ts 내부용. tool-call-loop은 구조적 접근 |
| `ChatChoice` | openclaw-client.ts:26 | `ChatResponse.choices` 멤버. 같은 파일 내부용 |
| `ChatResponse` | openclaw-client.ts:36 | `OpenClawClient` 반환 타입. 외부에서 직접 import 없음 |
| `EncryptedPayload` | relay-client.ts:16 | `_encrypt`/`_decrypt` 내부용. app은 자체 정의 사용 |
| `ToolResultEntry` | tool-call-loop.ts:17 | `ProcessChatResult` 멤버 + 로컬 배열 타입. 같은 파일 내부용 |
| `IntentErrorResult` | tool-surface.ts:58 | 결과 유니온 멤버. tool-surface.ts 내부용 |
| `IntentRejectedResult` | tool-surface.ts:64 | 결과 유니온 멤버. tool-surface.ts 내부용 |
| `TransferRejectedResult` | tool-surface.ts:71 | 결과 유니온 멤버. tool-surface.ts 내부용 |
| `switchSeed` | wdk-host.ts:87 | 함수 자체가 미사용. 프로덕션/테스트 모두 호출 없음 |

### relay (2건)

| 심볼 | 파일 | 사유 |
|------|------|------|
| `hashPassword` | routes/auth.ts:125 | 같은 파일 내부에서만 사용. export 키워드만 제거 |
| `verifyPassword` | routes/auth.ts:133 | 같은 파일 내부에서만 사용. export 키워드만 제거 |

### app (14건)

| 심볼 | 파일 | 사유 |
|------|------|------|
| `RootTabParamList` | app/RootNavigator.tsx:175 | 같은 파일 내부 `createBottomTabNavigator<>()` 제네릭용 |
| `AuthState` | stores/useAuthStore.ts:8 | `create<AuthState>()` 제네릭용. 외부 import 없음 |
| `ToolChatMessage` | stores/useChatStore.ts:31 | `ChatMessage` 유니온 멤버. 같은 파일 내부용 |
| `StatusChatMessage` | stores/useChatStore.ts:38 | `ChatMessage` 유니온 멤버. 같은 파일 내부용 |
| `UnsignedIntent` | core/approval/types.ts:21 | 정의만 존재. 프로젝트 전체에서 미사용 |
| `E2EKeyPair` | core/crypto/E2ECrypto.ts:16 | E2ECrypto 내부 타입. 외부 import 없음 |
| `EncryptedMessage` | core/crypto/E2ECrypto.ts:21 | E2ECrypto 내부 타입. 외부 import 없음 |
| `E2ECrypto` | core/crypto/E2ECrypto.ts:26 | 클래스 자체가 `new` 없음. 완전 미사용 |
| `ControlEnvelope` | core/relay/RelayClient.ts:29 | `sendControl` 메서드 파라미터 타입. 내부용 |
| `EncryptedPayload` | core/relay/RelayClient.ts:36 | `_encrypt`/`_decrypt` 내부용 |
| `TxApprovalStatus` | shared/tx/TxApprovalContext.tsx:17 | `TxApprovalState` DU로 대체. 외부 import 없음 |
| `TxApprovalState` | shared/tx/TxApprovalContext.tsx:19 | `useState<>` 제네릭용. 외부 import 없음 |
| `TxApprovalContextValue` | shared/tx/TxApprovalContext.tsx:32 | `createContext` + 훅 반환 타입. 소비자는 추론에 의존 |
| `TxApprovalInternalValue` | shared/tx/TxApprovalContext.tsx:38 | `createContext` + 훅 반환 타입. 소비자는 추론에 의존 |

---

## B — 타입 gap (28건)

런타임에서 사용 중이나 소비자가 `unknown`/구조적 매칭으로 받아 타입을 import하지 않음.
export 제거 시 나중에 타입 좁히기가 불가능해지므로 유지 필요.

### daemon (16건)

| 심볼 | 파일 | 런타임 사용처 |
|------|------|--------------|
| `AdminServerConfig` | admin-server.ts:15 | index.ts → `new AdminServer({ socketPath })` 구조적 전달 |
| `ChatHandlerOptions` | chat-handler.ts:12 | index.ts → `{ maxIterations }` 구조적 전달 |
| `ControlHandlerDeps` | control-handler.ts:39 | index.ts → `{ broker, logger, queueManager }` 구조적 전달 |
| `CronRegistration` | cron-scheduler.ts:21 | `CronScheduler.register()` 파라미터. 호출자 구조적 매칭 |
| `CronListItem` | cron-scheduler.ts:23 | `CronScheduler.list()` 반환 → admin-server.ts가 소비 |
| `CronSchedulerConfig` | cron-scheduler.ts:41 | index.ts → `new CronScheduler({ tickIntervalMs })` 구조적 전달 |
| `JournalEntry` | execution-journal.ts:8 | `ExecutionJournal.list()` 반환 → admin-server.ts가 소비 |
| `TrackMeta` | execution-journal.ts:17 | `ExecutionJournal.track()` 파라미터 → tool-surface.ts가 호출 |
| `CancelResult` | message-queue.ts:25 | `cancelQueued()`/`cancelActive()` 반환 → control-handler.ts가 `.ok`/`.reason` 구조적 소비 |
| `ProcessResult` | message-queue.ts:27 | `MessageProcessor` 콜백 반환 타입. 테스트에서 import |
| `MessageProcessor` | message-queue.ts:32 | 생성자 파라미터 타입. 테스트에서 import |
| `RelayClientOptions` | relay-client.ts:10 | index.ts → `new RelayClient(logger, { reconnectBaseMs, ... })` 구조적 전달 |
| `MessageHandler` | relay-client.ts:23 | index.ts → `relay.onMessage(callback)` 구조적 매칭 |
| `ProcessChatResult` | tool-call-loop.ts:32 | `processChat()` 반환 → chat-handler.ts가 `.content`/`.toolResults` 구조적 소비 |
| `ProcessChatOptions` | tool-call-loop.ts:38 | `processChat()` 파라미터 → chat-handler.ts가 구조적 전달 |
| `WDKInitResult` | wdk-host.ts:22 | `initWDK()` 반환 → index.ts가 `{ wdk, broker, store }` 구조분해 |

### relay (8건)

| 심볼 | 파일 | 런타임 사용처 |
|------|------|--------------|
| `RelayConfig` | config.ts:5 | `config` default export 값의 타입. 모든 모듈이 값만 import |
| `RateLimitOptions` | middleware/rate-limit.ts:8 | `new RateLimiter()` 생성자 파라미터. index.ts가 구조적 전달 |
| `RateLimitCheckResult` | middleware/rate-limit.ts:13 | `check()` 반환 → 훅에서 구조분해 |
| `RedisQueueOptions` | queue/redis-queue.ts:10 | `new RedisQueue()` 생성자 파라미터. index.ts가 구조적 전달 |
| `PgRegistryOptions` | registry/pg-registry.ts:33 | `new PgRegistry()` 생성자 파라미터. index.ts가 구조적 전달 |
| `PushResultOk` | routes/push.ts:8 | `sendPushNotification()` 반환 → ws.ts가 구조적 소비 |
| `PushResultFailed` | routes/push.ts:13 | `sendPushNotification()` 반환 → ws.ts가 구조적 소비 |
| `PushResult` | routes/push.ts:18 | `sendPushNotification()` 반환 타입. 호출자가 구조적 소비 |

### protocol (2건)

| 심볼 | 파일 | 런타임 사용처 |
|------|------|--------------|
| `ChatToolStartEvent` | chat.ts:50 | daemon이 `{ type: 'tool_start', ... }` 생성, app이 `switch('tool_start')` 소비. `ChatEvent` 유니온으로만 참조 |
| `ChatToolDoneEvent` | chat.ts:59 | daemon이 `{ type: 'tool_done', ... }` 생성, app이 `switch('tool_done')` 소비. `ChatEvent` 유니온으로만 참조 |

### app (2건)

| 심볼 | 파일 | 런타임 사용처 |
|------|------|--------------|
| `RootNavigator` | app/RootNavigator.tsx:195 | `App.tsx`에서 `<RootNavigator />` 렌더링. barrel index 없이 직접 import |
| `AppProviders` | app/providers/AppProviders.tsx:99 | `App.tsx`에서 `<AppProviders>` 렌더링. barrel index 없이 직접 import |

---

## C — 공개 API (61건)

index.ts에서 re-export하는 공개 타입. 외부 소비자가 아직 없지만 SDK 계약상 유지.

### guarded-wdk (12건)

`sign`, `generateKeyPair`, `KeyPair`, `WalletNotFoundError`, `NoMasterSeedError`, `permissionsToDict`, `SignTransactionResult`, `FailedArg`, `RuleFailure`, `EvaluationContext`, `EvaluationResult`, `JsonApprovalStore`

### canonical (3건)

`ChainId`, `IntentInput`, `sortKeysDeep`

### protocol (37건)

- **chat.ts** (5): `ChatTypingEvent`, `ChatStreamEvent`, `ChatDoneEvent`, `ChatErrorEvent`, `ChatCancelledEvent`
- **control.ts** (17): `PolicyApprovalPayload`, `DeviceRevokePayload`, `CancelQueuedPayload`, `CancelActivePayload`, `ApprovalType`, `ControlResultApprovalOk`, `ControlResultApprovalError`, `ControlResultCancelQueuedOk`, `ControlResultCancelQueuedError`, `ControlResultCancelActiveOk`, `ControlResultCancelActiveError`, `ControlResultCancelError`, `ControlResultGenericError`, `MessageQueuedEvent`, `MessageStartedEvent`, `CronSessionCreatedEvent`, `EventStreamEvent`
- **events.ts** (15): `WDKEventBase`, `IntentProposedEvent`, `PolicyEvaluatedEvent`, `ExecutionBroadcastedEvent`, `ExecutionSettledEvent`, `ExecutionFailedEvent`, `TransactionSignedEvent`, `PendingPolicyRequestedEvent`, `ApprovalVerifiedEvent`, `ApprovalRejectedEvent`, `PolicyAppliedEvent`, `SignerRevokedEvent`, `WalletCreatedEvent`, `WalletDeletedEvent`, `ApprovalFailedEvent`

### manifest (9건)

`manifestToPolicy`, `Call`, `Approval`, `ChainConfig`, `ValidationResultValid`, `ValidationResultInvalid`, `Types`, `validateManifest`, `aaveV3Manifest`

---

## 크로스 패키지 `unknown` 타입 체인 분석

dead export 분류 과정에서 발견된 핵심 문제: **잘 정의된 타입이 export되어 있지만, 중간 레이어가 `unknown`을 사용하여 타입 체인이 끊어지는 패턴.**

### 근본 원인: `approval-store.ts`의 `unknown` 시작점

```
guarded-wdk 내부에서 이미 타입 체인이 끊김:

evaluatePolicy() → EvaluationResult (잘 정의됨)
       ↓ PolicyRejectionError.context: unknown  ← 여기서 끊김
       ↓ approval-store.ts PolicyInput.policies: unknown[]  ← 여기서도 끊김
       ↓ RejectionEntry.context: unknown
       ↓ PolicyVersionEntry.diff: unknown
```

이 `unknown`이 전체 시스템으로 전파:

```
guarded-wdk (unknown 시작)
  → protocol/events.ts (PolicyEvaluatedEvent.context: unknown, matchedPermission: unknown)
    → daemon/tool-surface.ts (IntentRejectedResult.context: unknown, policies: unknown[])
      → daemon/index.ts (event: unknown → relay)
        → app (Record<string, unknown>으로 최종 소비)
```

### 크로스 패키지 `unknown` 타입 gap 목록

#### 1. Policy 평가 결과 체인 (최고 우선순위)

| 위치 | `unknown` 필드 | 실제 런타임 타입 | 소비자 |
|------|---------------|-----------------|--------|
| `guarded-wdk/errors.ts:9` | `PolicyRejectionError.context: unknown` | `EvaluationContext \| null` | daemon tool-surface |
| `protocol/events.ts:32` | `PolicyEvaluatedEvent.matchedPermission: unknown` | `Rule \| null` | daemon, app |
| `protocol/events.ts:34` | `PolicyEvaluatedEvent.context: unknown` | `EvaluationContext \| null` | daemon, app |
| `guarded-wdk/approval-store.ts:145` | `RejectionEntry.context: unknown` | `EvaluationContext \| null` | daemon tool-surface → AI |
| `daemon/tool-surface.ts:68,74` | `IntentRejectedResult.context: unknown` | `EvaluationContext \| null` | AI 루프, app |

**영향**: daemon AI가 정책 거부 사유를 구조적으로 파악 불가. app이 어떤 규칙이 위반됐는지 표시 불가.

#### 2. Policy 데이터 체인

| 위치 | `unknown` 필드 | 실제 런타임 타입 | 소비자 |
|------|---------------|-----------------|--------|
| `guarded-wdk/approval-store.ts:53` | `PolicyInput.policies: unknown[]` | `Policy[]` | broker, daemon |
| `guarded-wdk/signed-approval-broker.ts:31` | `ApprovalSubmitContext.policies: unknown[]` | `Policy[]` | control-handler |
| `guarded-wdk/approval-store.ts:155` | `PolicyVersionEntry.diff: unknown` | `PolicyDiff` | daemon → AI |
| `daemon/tool-surface.ts:119` | `PolicyListResult.policies: unknown[]` | `Policy[]` | AI 루프 |

**영향**: 시스템의 핵심 비즈니스 데이터(정책)가 전 레이어에서 `unknown[]`. AI가 정책 내용을 구조적으로 추론 불가.

#### 3. Tool 결과 / 이벤트 전달 체인

| 위치 | `unknown` 필드 | 실제 런타임 타입 | 소비자 |
|------|---------------|-----------------|--------|
| `protocol/chat.ts:30` | `ChatDoneEvent.toolResults: unknown[]` | `ToolResultEntry[]` | app DashboardScreen |
| `daemon/tool-surface.ts:112` | `GetBalanceResult.balances: unknown[]` | WDK balance 객체 | AI 루프 |
| `daemon/tool-surface.ts:126` | `PolicyPendingResult.pending: unknown[]` | `PendingApprovalRequest[]` | AI 루프 |
| `daemon/tool-surface.ts:149` | `ListCronsResult.crons: unknown[]` | `StoredCron[]` | AI 루프 |
| `daemon/tool-surface.ts:182` | `ListRejectionsResult.rejections: unknown[]` | `RejectionEntry[]` | AI 루프 |
| `daemon/tool-surface.ts:189` | `ListPolicyVersionsResult.policyVersions: unknown[]` | `PolicyVersionEntry[]` | AI 루프 |

**영향**: daemon tool-surface의 12개 결과 타입 중 6개가 `unknown[]` 배열. app의 `DashboardScreen`이 `toolResults`를 수동 캐스팅.

#### 4. Relay 전송 레이어

| 위치 | `unknown` 필드 | 실제 런타임 타입 | 소비자 |
|------|---------------|-----------------|--------|
| `protocol/relay.ts:16` | `RelayEnvelope.payload: unknown` | `ControlEvent \| ChatEvent` | relay, daemon, app |
| `app/RelayClient.ts:25,31` | `RelayMessage.payload: unknown` | `ControlEvent \| ChatEvent` | 3개 스크린 |
| `app/RelayClient.ts:389` | `sendApproval(signedApproval: unknown)` | `SignedApproval` | app 내부 |
| `daemon/index.ts:133` | `wdk.on(eventName, (event: unknown))` | `AnyWDKEvent` | relay 전달 |

**영향**: 모든 WebSocket 소비자가 각각 독립적으로 `as` 캐스팅. 프로토콜 변경 시 컴파일 타임 안전망 없음.

### dead export와 `unknown` 체인의 관계

C로 분류된 타입 중 실제로 크로스 패키지에서 `unknown`으로 소비되는 것들:

| 타입 (guarded-wdk C 분류) | `unknown`으로 소비되는 위치 |
|--------------------------|--------------------------|
| `FailedArg` | `RuleFailure.args` → `EvaluationContext.ruleFailures` → `PolicyRejectionError.context: unknown` |
| `RuleFailure` | `EvaluationContext.ruleFailures` → 동일 체인 |
| `EvaluationContext` | `PolicyRejectionError.context: unknown`, `protocol/events.ts:34 unknown` |
| `EvaluationResult` | `evaluatePolicy()` 반환 → 결과가 `unknown`으로 분해됨 |
| `SignTransactionResult` | daemon이 자체 정의 사용 (`tool-surface.ts`), guarded-wdk 타입 미참조 |

**결론**: 이 타입들은 export되어 있고 "dead"로 보이지만, 실제로는 **`unknown` 체인 때문에 import되지 않는 것**. `unknown`을 제거하면 자연스럽게 import가 필요해지면서 dead export가 해소됨.

---

## 후속 조치 제안

### 즉시 실행 가능: A 카테고리 정리

37건의 `export` 키워드 제거. 내부 사용이 있는 심볼은 export만 제거, 완전 미사용(`E2ECrypto`, `UnsignedIntent`, `switchSeed`)은 삭제 검토.

### Phase 후보 1: `unknown` 체인 해소 (높은 가치)

근본 원인부터 수정하면 downstream이 자동 해소:

1. **guarded-wdk `approval-store.ts`** — `policies: unknown[]` → `Policy[]`, `context: unknown` → `EvaluationContext | null`, `diff: unknown` → `PolicyDiff`
2. **guarded-wdk `errors.ts`** — `PolicyRejectionError.context: unknown` → `EvaluationContext | null`
3. **protocol `events.ts`** — `PolicyEvaluatedEvent.matchedPermission: unknown` → `Rule | null`, `context: unknown` → `EvaluationContext | null`
4. **protocol `chat.ts`** — `ChatDoneEvent.toolResults: unknown[]` → 공유 타입 정의
5. **daemon `tool-surface.ts`** — 7개 `unknown[]` 필드를 구체 타입으로

이 5개 파일 수정으로 C 분류 중 4건(`FailedArg`, `RuleFailure`, `EvaluationContext`, `EvaluationResult`)이 자연스럽게 import되며 dead export 해소.

### Phase 후보 2: B 카테고리 내부 타입 import 정리

28건의 같은 패키지 내 구조적 매칭을 명시적 타입 import로 전환. `unknown` 체인 해소보다 우선순위 낮음.

### C 카테고리 장기 검토

61건은 현재 유지. 실제 외부 SDK 사용 계획이 확정되면 불필요한 API 정리.
