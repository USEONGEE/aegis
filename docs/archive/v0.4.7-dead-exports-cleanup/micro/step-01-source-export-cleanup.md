# Step 01: 소스 파일 export 키워드 제거 + dead code 삭제

## 메타데이터
- **난이도**: 🟢 쉬움 (기계적 작업)
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

### A1: export 키워드 제거 (31건)
같은 파일 내부에서 사용 중이나 외부 import 없는 심볼에서 `export` 키워드만 삭제.

**guarded-wdk (5건)**:
- `approval-broker.js:5` — `InMemoryApprovalBroker`
- `guarded-middleware.ts:221` — `evaluatePolicy`
- `guarded-middleware.ts:30` — `CallPolicy`
- `guarded-middleware.ts:35` — `TimestampPolicy`
- `guarded-middleware.ts:70` — `GuardedAccount`

**daemon (16건)**:
- `cron-scheduler.ts` — `CronBase`(7), `CronEntry`(16)
- `message-queue.ts` — `CancelResultOk`(15), `CancelResultFailed`(20), `QueueLogger`(34), `MessageQueueOptions`(39), `SessionMessageQueue`(45)
- `openclaw-client.ts` — `ToolCall`(16), `ChatChoice`(26), `ChatResponse`(36)
- `relay-client.ts` — `EncryptedPayload`(16)
- `tool-call-loop.ts` — `ToolResultEntry`(17)
- `tool-surface.ts` — `IntentErrorResult`(58), `IntentRejectedResult`(64), `TransferRejectedResult`(71)
- `wdk-host.ts` — `switchSeed`(87) → **A2: 함수 자체 삭제**

**relay (2건)**:
- `routes/auth.ts:125` — `hashPassword`
- `routes/auth.ts:133` — `verifyPassword`

**app (14건)**:
- `RootNavigator.tsx:175` — `RootTabParamList`
- `useAuthStore.ts:8` — `AuthState`
- `useChatStore.ts:31` — `ToolChatMessage`
- `useChatStore.ts:38` — `StatusChatMessage`
- `core/approval/types.ts:21` — `UnsignedIntent` → **A2: 인터페이스 삭제**
- `core/crypto/E2ECrypto.ts` — `E2EKeyPair`, `EncryptedMessage`, `E2ECrypto` → **A2: 파일 전체 삭제**
- `core/relay/RelayClient.ts:29` — `ControlEnvelope`
- `core/relay/RelayClient.ts:36` — `EncryptedPayload`
- `TxApprovalContext.tsx:17` — `TxApprovalStatus` → **A2: 타입 삭제**
- `TxApprovalContext.tsx:19` — `TxApprovalState`
- `TxApprovalContext.tsx:32` — `TxApprovalContextValue`
- `TxApprovalContext.tsx:38` — `TxApprovalInternalValue`

### A2: dead code 삭제 (4건)
- `switchSeed` (daemon/wdk-host.ts:87) — 함수 삭제
- `UnsignedIntent` (app/core/approval/types.ts:21) — 인터페이스 삭제
- `E2ECrypto.ts` (app/core/crypto/) — 파일 전체 삭제
- `TxApprovalStatus` (app/shared/tx/TxApprovalContext.tsx:17) — 타입 별칭 삭제

### 참고: v0.4.6 리네임 반영
- `approval-store.ts` → `wdk-store.ts`
- `json-approval-store.ts` → `json-wdk-store.ts`
- `sqlite-approval-store.ts` → `sqlite-wdk-store.ts`
- `ApprovalStore` → `WdkStore`, `JsonApprovalStore` → `JsonWdkStore`, `SqliteApprovalStore` → `SqliteWdkStore`

## 2. 완료 조건
- [ ] 31건 `export` 키워드 제거 완료
- [ ] 4건 dead code 삭제 완료
- [ ] `npx tsc --noEmit -p packages/guarded-wdk/tsconfig.json` 통과
- [ ] `npx tsc --noEmit -p packages/daemon/tsconfig.json` 통과
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` 통과
- [ ] `cd packages/daemon && npm run build` 성공 (DoD N7)

## 3. 롤백 방법
- `git revert <step-01 commit>` — 이 Step의 커밋만 되돌림

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-broker.js         # export 제거 (InMemoryApprovalBroker)
└── guarded-middleware.ts      # export 제거 4건

packages/daemon/src/
├── cron-scheduler.ts          # export 제거 2건
├── message-queue.ts           # export 제거 5건
├── openclaw-client.ts         # export 제거 3건
├── relay-client.ts            # export 제거 1건
├── tool-call-loop.ts          # export 제거 1건
├── tool-surface.ts            # export 제거 3건
└── wdk-host.ts                # switchSeed 함수 삭제

packages/relay/src/
└── routes/auth.ts             # export 제거 2건

packages/app/src/
├── app/RootNavigator.tsx      # export 제거 1건
├── stores/useAuthStore.ts     # export 제거 1건
├── stores/useChatStore.ts     # export 제거 2건
├── core/approval/types.ts     # UnsignedIntent 삭제
├── core/crypto/E2ECrypto.ts   # 파일 삭제
├── core/relay/RelayClient.ts  # export 제거 2건
└── shared/tx/TxApprovalContext.tsx  # export 제거 3건 + TxApprovalStatus 삭제
```

## FP/FN 검증

### False Positive (과잉) — 없음
모든 Scope 항목이 triage 분석에서 확인된 A1/A2 대상.

### False Negative (누락) — 없음
31건 A1 + 4건 A2 = 35건 전수 포함.

### 검증 통과: ✅

---

→ 다음: [Step 02: index.ts re-export 정리](step-02-index-cleanup.md)
