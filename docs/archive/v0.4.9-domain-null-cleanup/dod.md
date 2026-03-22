# DoD (Definition of Done) - v0.4.9

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `VerificationContext`에서 `currentPolicyVersion` 필드 삭제. `expectedTargetHash`는 `VerificationTarget` DU(`verify_hash` \| `skip_hash`)로 전환 | `grep -r 'currentPolicyVersion' packages/` 결과 0건. `approval-verifier.ts`에 `VerificationTarget` DU 존재 확인 |
| F2 | `PendingApprovalRequest.walletName`이 `string` (not `string \| null`). 생성 시점에 fallback 확정 | `grep 'walletName.*null' packages/guarded-wdk/src/wdk-store.ts` 결과 0건. Store 구현에서 DB null → fallback 매핑 확인 |
| F3 | `StoredSigner.name`이 `string` (not `string \| null`) | `grep 'name.*string.*null' packages/guarded-wdk/src/wdk-store.ts` 에서 StoredSigner 관련 결과 0건 |
| F4 | `ExecutionJournal` logger가 `JournalLogger` (not `JournalLogger \| null`). NullLogger 패턴 적용 | `grep 'JournalLogger.*null' packages/guarded-wdk/src/` 결과 0건 |
| F5 | `loadPendingApprovals`가 `PendingApprovalFilter` 객체를 받음. positional null 파라미터 제거 | `rg 'loadPendingApprovals\(' packages/ --type ts` — 모든 매치가 `(filter)` 또는 `({...})` 형태. `(null` 패턴 0건 |
| F6 | `DaemonStore.listCrons`가 `CronFilter` 객체를 받음 | `rg 'listCrons\(' packages/daemon/ --type ts` — 모든 매치가 `(filter)` 또는 `({...})` 형태. `(null` 패턴 0건 |
| F7 | `HistoryEntry.signedApproval`이 `SignedApproval` (not `\| null`). `HistoryEntry.chainId`가 `number` (not `\| null`) | `grep 'signedApproval.*null\|chainId.*null' packages/guarded-wdk/src/wdk-store.ts` HistoryEntry 관련 결과 0건 |
| F8 | `CronInput.chainId`, `QueuedMessage.chainId`가 `ChainScope` DU로 전환. `{ kind: 'specific'; chainId: number } \| { kind: 'all' }` | `rg 'ChainScope' packages/ --type ts` — 타입 정의 존재. `rg 'chainId.*number.*null' packages/daemon/src/daemon-store.ts packages/daemon/src/message-queue.ts` 결과 0건 |
| F9a | `EvaluationResult`가 3-variant DU (`AllowResult \| SimpleRejectResult \| DetailedRejectResult`). `context: EvaluationContext \| null` + `matchedPermission: Rule \| null` 동시 제거 | `grep 'context.*EvaluationContext.*null' packages/guarded-wdk/src/guarded-middleware.ts` 결과 0건. DU `kind` discriminant 확인 |
| F9b | `protocol/events.ts`의 `PolicyEvaluatedEvent` wire 타입이 DU 반영 (`matchedPermission \| null`, `context \| null` 제거) | `grep 'null' packages/protocol/src/events.ts` 에서 PolicyEvaluated 관련 null 0건 |
| F9c | daemon의 PolicyEvaluated emit이 DU variant에 맞게 변경 | `rg 'PolicyEvaluated' packages/guarded-wdk/src/guarded-middleware.ts --type ts -A5` — emit 코드가 `kind` 기반 variant 전달 확인 |
| F9d | app의 PolicyEvaluated consumer가 DU wire 타입에 맞게 업데이트 | `npx tsc -p packages/app/tsconfig.json --noEmit` 통과 |
| F10 | `StoredSigner.revokedAt`가 `SignerStatus` DU로 전환 (`active \| revoked`) | `grep 'revokedAt.*null' packages/guarded-wdk/src/wdk-store.ts` StoredSigner 관련 결과 0건 |
| F11 | App `ApprovalRequest`가 DU. `targetPublicKey`는 `device_revoke` variant에서만 필수, 나머지에 없음 | `grep 'targetPublicKey.*null' packages/app/src/` 결과 0건 |
| F12 | `tool-surface.ts` result 타입의 `hash`, `fee`, `signedTx`가 non-null | `grep 'hash.*null\|fee.*null\|signedTx.*null' packages/daemon/src/tool-surface.ts` result 관련 결과 0건 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| 도메인 모델 `\| null` ~38건 제거 | F1~F12 전체 |
| Dead 필드 삭제 (currentPolicyVersion) | F1 |
| expectedTargetHash DU 전환 | F1 |
| 패턴 확립 (일관된 해결 방식) | F5, F6 (filter), F8~F11 (DU), F2~F4 (기본값) |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 항목 |
|----------|---------|
| DU discriminant: `kind` 필드 | F1, F8, F9a, F10 |
| Filter 파라미터: optional property 허용 | F5, F6 |
| DB Row 타입 null 유지 | N3 (store-types.ts 변경 없음 확인) |
| exhaustiveness check: `never` 가드 | F8, F9a, N4 |
| wire breaking change 허용 | F9b (protocol/events.ts 변경) |
| protocol wire → daemon emit → app consumer 전체 경로 | F9a, F9b, F9c, F9d |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 (변경 패키지) | `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit && npx tsc -p packages/daemon/tsconfig.json --noEmit && npx tsc -p packages/protocol/tsconfig.json --noEmit && npx tsc -p packages/app/tsconfig.json --noEmit` |
| N2 | 기존 테스트 전부 통과 (canonical, guarded-wdk, manifest, daemon) | `npm test` (root workspace script) |
| N3 | `store-types.ts`의 DB Row 타입 null 변경 없음 | `git diff packages/guarded-wdk/src/store-types.ts` — null 관련 변경 없음 확인 |
| N4 | 모든 DU switch에 `never` exhaustiveness guard 존재 | `rg 'assertNever\|: never' packages/guarded-wdk/src packages/daemon/src --type ts` — 각 DU switch에 guard 존재 |
| N5 | `getStatus()` dead method 삭제 | `grep 'getStatus' packages/guarded-wdk/src/execution-journal.ts` 결과 0건 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | DB에 `wallet_name = NULL`인 기존 row 읽기 | fallback 값(`Wallet {idx}`) 적용, 에러 없음 | Store unit test에 null row 케이스 추가 |
| E2 | DB에 `signed_approval_json = NULL`인 기존 HistoryEntry row | 해당 row skip (결과에서 제외) | Store unit test에 null row 케이스 추가 |
| E3 | DB에 `chain_id = NULL`인 HistoryEntry row | signedApproval JSON에서 chainId 복원. 복원 불가 시 해당 row skip | Store unit test에 null row 케이스 추가 |
| E4 | DB에 `revoked_at = NULL`인 StoredSigner row | `{ kind: 'active' }` 변환 | Store unit test 확인 |
| E5 | evaluatePolicy에서 정책 없는 chain 평가 | `SimpleRejectResult` (kind: 'reject') 반환, context 없음 | evaluate-policy 단위 테스트 |
| E6 | evaluatePolicy에서 rule 후보 있으나 조건 불일치 | `DetailedRejectResult` (kind: 'reject_with_context') 반환, context 포함 | evaluate-policy 단위 테스트 |
| E7 | Cron 등록 시 chainId 미지정 | `ChainScope = { kind: 'all' }` 저장 | Cron 테스트 |
| E8 | App에서 device_revoke 외 승인 요청 생성 | `targetPublicKey` 필드 없음 (타입 레벨에서 불가) | `npx tsc -p packages/app/tsconfig.json --noEmit` 통과 |
| E9 | `loadPendingApprovals({})` (빈 filter) | 전체 조회 (필터 없음). 기존 `(null, null, null)` 동작과 동일 | Store unit test 확인 |
| E10 | `listCrons({})` (빈 filter) | 전체 조회 (필터 없음) | Store unit test 확인 |
| E11 | `ToolAccount.sendTransaction`이 hash/fee를 반환 — guarded-middleware `TransactionResult`와 일관 | `tool-surface.test.ts`에서 result에 hash, fee가 항상 non-null인 assertion 확인 |
