# DoD (Definition of Done) - v0.1.4

## 기능 완료 조건

### 리팩토링 항목 (동작 변경 없음)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `CallPolicy.permissions`가 `PermissionDict` 타입 (`{[target]: {[selector]: Rule[]}}`)이다 | `grep -r 'permissions: Permission\[\]' packages/` 결과 0건 |
| F2 | `Rule`에 `order: number` 필드가 있고, evaluatePolicy에서 후보 수집 → order 정렬 → 첫 매칭 반환한다 | evaluate-policy.test.ts에서 wildcard+specific 혼합 시 원본 순서대로 매칭되는 테스트 통과 (`npm test -- --testPathPattern evaluate-policy`) |
| F3 | `manifestToPolicy()`가 `PermissionDict`를 반환한다 | `npm test -- --testPathPattern manifest-to-policy` 통과 |
| F4 | 모든 패키지에서 `chain` 필드(required/optional/union 모두)가 `chainId: number`로 변경되었다 | `grep -rEn '\bchain\??: string' packages/guarded-wdk/src/ packages/daemon/src/ packages/canonical/src/ packages/manifest/src/ packages/app/src/` 결과 0건 |
| F5 | `CHAIN_IDS` 상수가 `packages/canonical/src/index.ts`에 존재하고 `as const satisfies Record<string, number>`이다 | `grep 'CHAIN_IDS' packages/canonical/src/index.ts` + `npm test -- --testPathPattern canonical` 통과 |
| F6 | daemon tool-surface에서 unknown chain 입력 시 에러 반환한다 | `npm test -- --testPathPattern tool-surface` 내 unknown chain 테스트 통과 |
| F7 | 내부 API 인터페이스(HistoryEntry, CronInput, JournalEntry)가 camelCase만 사용한다 | `grep -rE 'seed_id\?|target_hash\?|device_id\?|intent_id\?|tx_hash\?' packages/guarded-wdk/src/approval-store.ts` 결과 0건 |
| F8 | `ApprovalStore` abstract 메서드 시그니처가 camelCase 타입만 사용한다 (getHistory → HistoryEntry[]) | `grep -n 'StoredHistoryEntry\|StoredJournalEntry' packages/guarded-wdk/src/approval-store.ts` 결과 0건 + `npm test -- --testPathPattern approval-store` 통과 |
| F9 | `Stored*` 타입이 approval-store.ts에서 export되지 않는다 | `grep -n 'export.*StoredHistoryEntry\|export.*StoredJournalEntry\|export.*CronRecord' packages/guarded-wdk/src/approval-store.ts` 결과 0건 |
| F10 | `SignedPolicy`에서 `wdk_countersig` 필드가 제거되었다 | `grep -rn 'wdk_countersig' packages/guarded-wdk/src/` 결과 0건 |
| F11 | SQLite `policies` 테이블에 `wdk_countersig` 컬럼이 없다 | `grep -n 'wdk_countersig' packages/guarded-wdk/src/sqlite-approval-store.ts` 결과 0건 |
| F12 | `PendingRequest`가 `PendingApprovalRequest`로 변경, camelCase 필드 사용 | `grep -rn 'interface PendingRequest ' packages/guarded-wdk/src/` 결과 0건 |
| F13 | ApprovalStore 메서드명이 `loadPendingApprovals`, `savePendingApproval`, `removePendingApproval`이다 | `grep -n 'loadPending(' packages/guarded-wdk/src/approval-store.ts` 결과 0건 (옛 이름 없음) |
| F14 | Manifest.chains가 `Record<number, ChainConfig>`이고 chainId가 `number`이다 | `npm test -- --testPathPattern manifest-to-policy` 통과 (chainId: 1로 테스트) |
| F15 | app 전체(approval types, builder, stores, screens, providers)에서 `chain` 필드가 `chainId: number`로 변경되었다 | `grep -rEn '\bchain\??: string' packages/app/src/` 결과 0건 (F4 app 전용 검증) |

### 신규 기능 항목

| # | 조건 | 검증 방법 |
|---|------|----------|
| F16 | `SessionMessageQueue` 클래스가 `packages/daemon/src/message-queue.ts`에 존재한다 | `grep -n 'class SessionMessageQueue' packages/daemon/src/message-queue.ts` 결과 1건 |
| F17 | 동일 sessionId에 대한 user + cron 메시지가 순차적으로 처리된다 | `npm test -- --testPathPattern message-queue` 내 "동시 enqueue 순서 보장" 테스트 통과 |
| F18 | `handleChatMessage()`와 `CronScheduler.tick()`이 `MessageQueueManager`를 통해 enqueue한다 | 금지 패턴: `grep -rn 'processChat(' packages/daemon/src/chat-handler.ts packages/daemon/src/cron-scheduler.ts` 결과 0건. 의도 패턴: `grep -rn 'queueManager\|enqueue' packages/daemon/src/chat-handler.ts packages/daemon/src/cron-scheduler.ts` 결과 1건 이상 |
| F19 | `PendingMessageRequest` 인터페이스가 `messageId, sessionId, source, text, createdAt` 필드를 가진다 | `grep -A5 'interface PendingMessageRequest' packages/daemon/src/message-queue.ts` 출력에 5개 필드 확인 |
| F20 | daemon이 메시지 enqueue 시 `message_queued` 타입 control message를 relay로 전송한다 (messageId 포함) | `npm test -- --testPathPattern message-queue` 내 "message_queued ack" 테스트 통과 |
| F21 | daemon이 control channel에서 `cancel_message`를 수신하면 큐에서 취소하고 `cancel_message_result`를 반환한다 | `npm test -- --testPathPattern message-queue` 내 "cancel" 테스트 통과 |
| F22 | 처리 중인 메시지 취소 시 AbortController.abort() 호출 → processChat 중단 | `npm test -- --testPathPattern message-queue` 내 "처리 중 취소 abort" 테스트 통과 |
| F23 | `cancel()` 메서드가 `CancelResult` (`{ ok, reason?, wasProcessing? }`)를 반환한다 | `grep -A3 'interface CancelResult' packages/daemon/src/message-queue.ts` 출력에 3개 필드 확인 |
| F24 | GuardedAccount에 `signTransaction(tx)` 메서드가 존재하고 `SignTransactionResult`를 반환한다 | `npm test -- --testPathPattern integration` 내 "signTransaction" 테스트 통과 |
| F25 | ExecutionJournal에 `signed` 상태가 추가되었다 | `grep -n "'signed'" packages/daemon/src/execution-journal.ts` 결과 1건 이상 |
| F26 | daemon tool-surface에 `signTransaction` 도구가 정의되어 있다 | `npm test -- --testPathPattern tool-surface` 내 "signTransaction" 테스트 통과 |
| F27 | app의 RelayClient가 `message_queued` 메시지를 수신하여 messageId를 추출할 수 있다 | `grep -rn 'message_queued' packages/app/src/` 결과 1건 이상 |
| F28 | app의 RelayClient에 `cancelMessage(messageId)` 메서드가 있고, control channel로 `cancel_message` 타입을 전송한다 | `grep -rn 'cancel_message\|cancelMessage' packages/app/src/core/relay/RelayClient.ts` 결과 1건 이상 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 (변경 대상 패키지) | `for pkg in canonical guarded-wdk manifest daemon; do npx tsc --noEmit -p packages/$pkg/tsconfig.json; done` 전체 exit 0 |
| N2 | 기존 테스트 + 신규 테스트 전체 통과 (canonical, guarded-wdk, manifest, daemon) | `npm test` 통과 (루트 스크립트 범위: canonical/guarded-wdk/manifest/daemon) |
| N3 | app 패키지 타입 체크 통과 | `npx tsc --noEmit -p packages/app/tsconfig.json` exit 0 |
| N4 | CI 체크 전체 PASS | `npx tsx scripts/check/index.ts` 출력에 "FAIL" 0건 |
| N5 | type-dep-graph 재생성 완료 | `npm run type-graph:json` 실행 후 `git diff docs/type-dep-graph/` 에서 구조 변경 반영 확인 |
| N6 | 모든 SQLite 테이블의 `chain` → `chain_id` 컬럼 변경 반영 | `npm test -- --testPathPattern sqlite-approval-store` 통과 |
| N7 | JSON Store 키 포맷 `${seedId}:${chainId}` (number) 사용 | `npm test -- --testPathPattern json-approval-store` 통과 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | PermissionDict에 wildcard target이 원본 배열에서 specific target보다 먼저 위치 | wildcard의 order가 더 작으므로 wildcard rule이 먼저 매칭됨 (기존 동작 유지) | `npm test -- --testPathPattern evaluate-policy` 내 "wildcard order priority" 테스트 통과 |
| E2 | exact target+selector와 wildcard target+selector가 동시에 존재 | order가 작은 쪽이 우선 | `npm test -- --testPathPattern evaluate-policy` 내 "mixed wildcard order" 테스트 통과 |
| E3 | daemon tool-surface에 CHAIN_IDS에 없는 chain string 전달 | `{ status: 'error', error: 'Unknown chain: ...' }` 반환 | `npm test -- --testPathPattern tool-surface` 내 "unknown chain" 테스트 통과 |
| E4 | FIFO queue에 maxQueueSize(기본 100) 초과 enqueue 시도 | Error throw ("Queue full: max 100") | `npm test -- --testPathPattern message-queue` 내 "queue full" 테스트 통과 |
| E5 | 이미 완료된 메시지에 대해 cancel 요청 | `{ ok: false, reason: 'already_completed' }` 반환 | `npm test -- --testPathPattern message-queue` 내 "cancel completed" 테스트 통과 |
| E6 | 존재하지 않는 messageId에 대해 cancel 요청 | `{ ok: false, reason: 'not_found' }` 반환 | `npm test -- --testPathPattern message-queue` 내 "cancel not found" 테스트 통과 |
| E7 | signTransaction 후 동일 intentHash로 재시도 | `{ status: 'duplicate' }` 반환 | `npm test -- --testPathPattern tool-surface` 내 "signTransaction duplicate" 테스트 통과 |
| E8 | signTransaction에서 REQUIRE_APPROVAL 정책 | approval flow → 승인 → 서명만 (전송 안함) → journal "signed" 상태 | `npm test -- --testPathPattern integration` 내 "signTransaction approval" 테스트 통과 |
