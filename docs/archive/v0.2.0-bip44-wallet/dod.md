# DoD (Definition of Done) - v0.2.0

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `MasterSeed`가 1개만 저장됨 (SQLite `id=1` 제약, JSON 단일 객체) | `store.setMasterSeed()` 2회 호출 시 덮어쓰기 확인, unit test |
| F2 | `StoredWallet`이 `accountIndex`(정수) 기반으로 CRUD 가능 | `createWallet(0, "DeFi", "0x...")` → `getWallet(0)` → `deleteWallet(0)` unit test |
| F3 | `listSeeds`, `addSeed`, `removeSeed`, `setActiveSeed`, `getActiveSeed`, `getSeed` 6개 메서드 완전 제거 (인터페이스 + 구현체) | `grep -r 'listSeeds\|addSeed\|removeSeed\|setActiveSeed\|getActiveSeed\|getSeed' packages/guarded-wdk/src/ packages/daemon/src/` 결과 0건 |
| F4 | 모든 저장소 메서드에서 `seedId` 파라미터가 `accountIndex`로 교체됨 | `grep -r 'seedId' packages/guarded-wdk/src/ packages/daemon/src/` 결과 0건 (store-types 내부 row 제외) |
| F5a | `ApprovalType`에 `'wallet_create' \| 'wallet_delete'` 추가됨 | `grep -r 'wallet_create' packages/guarded-wdk/src/approval-store.ts` 매칭 + `grep -r 'wallet_delete' packages/guarded-wdk/src/approval-store.ts` 매칭 |
| F5b | `device_revoke` 명칭이 전체 계약에서 유지됨 | `grep -r 'device_revoke' packages/guarded-wdk/src/approval-store.ts packages/daemon/src/control-handler.ts packages/app/src/core/` 모두 매칭 |
| F6 | `SignedApprovalBroker`가 `wallet_create` 처리 시 `pending_requests.wallet_name`에서 name을 읽어 `store.createWallet()` 호출 | unit test: wallet_create approval → wallet 생성 확인 |
| F7 | `SignedApprovalBroker`가 `wallet_delete` 처리 시 cascade 삭제 (policies, pending_requests, crons, execution_journal 삭제, approval_history 보존) | unit test: wallet_delete → 관련 데이터 삭제 + history 보존 확인 |
| F8a | guarded-wdk: `ApprovalRequest`/`SignedApproval`에서 `metadata` 필드 완전 제거, `accountIndex`/`content` 정규 필드로 교체 | `grep -r 'metadata' packages/guarded-wdk/src/approval-store.ts packages/guarded-wdk/src/signed-approval-broker.ts` 결과 0건 |
| F8b | daemon: `control-handler.ts`에서 `metadata` 접근 제거, `accountIndex`/`content` 정규 필드 사용 | `grep -r 'metadata' packages/daemon/src/control-handler.ts` 결과 0건 |
| F8c | app: `types.ts`, `SignedApprovalBuilder.ts`, `RelayClient.ts`에서 `metadata` 제거, `accountIndex`/`content` 사용 | `grep -r 'metadata' packages/app/src/core/approval/ packages/app/src/core/relay/RelayClient.ts` 결과 0건 |
| F8d | app: 승인 화면(`ApprovalScreen`)에서 `content` 표시 + wallet 이름 표시 | `ApprovalScreen.tsx`에서 `content`/`accountIndex` 접근 코드 존재 + 수동 검증: Expo 실행 → 승인 요청 발생 → content 문구와 wallet 이름이 화면에 렌더링됨 확인 |
| F9 | `intentHash`가 `timestamp` 포함하여 생성됨 | unit test: 동일 `(chainId, to, data, value)` + 다른 timestamp → 다른 해시 |
| F10 | `intentId`(UUID) 완전 제거, `intentHash`가 journal PK | `grep -r 'intentId' packages/` 결과 0건 |
| F11 | `WDKContext.seedId` 제거, 도구 호출 시 `accountIndex`를 args에서 받음 | `grep 'seedId' packages/daemon/src/tool-surface.ts` 결과 0건 |
| F12 | AI 도구 `sendTransaction`, `signTransaction`, `transfer`, `registerCron`, `policyRequest`에 `accountIndex` 파라미터 추가 | tool definition JSON에 `accountIndex` 필드 존재 확인 |
| F13 | `ExecutionJournal` 생성자에서 `seedId` 파라미터 제거, 전체 wallet journal 관리 | `grep 'seedId' packages/daemon/src/execution-journal.ts` 결과 0건 |
| F14 | `CronScheduler` 생성자에서 `seedId` 파라미터 제거, 전체 cron 관리 | `grep 'seedId' packages/daemon/src/cron-scheduler.ts` 결과 0건 |
| F15 | daemon boot 시 `getMasterSeed()` → `listWallets()` → 각 wallet별 정책 복원 | daemon 초기화 코드에서 `getActiveSeed` 없음, `listWallets` + `listPolicyChains(accountIndex)` 사용 확인 |
| F16 | `pending_requests.account_index`에 FK 없음 (wallet_create 지원) | SQLite 스키마에 FK 없음 확인 |
| F17 | `admin-server.ts`에서 seedId 관련 코드 제거, wallet 목록 API로 교체 | `grep 'seedId\|getActiveSeed\|seed_list' packages/daemon/src/admin-server.ts` 결과 0건 + `grep 'listWallets\|wallet_list' packages/daemon/src/admin-server.ts` 매칭 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk tsc 에러 0 | `cd packages/guarded-wdk && npx tsc --noEmit` |
| N2 | daemon tsc 에러 0 | `cd packages/daemon && npx tsc --noEmit` |
| N3 | canonical tsc 에러 0 | `cd packages/canonical && npx tsc --noEmit` |
| N4 | guarded-wdk 테스트 전체 통과 | `cd packages/guarded-wdk && npm test` |
| N5 | daemon 테스트 전체 통과 | `cd packages/daemon && npm test` |
| N6 | 타입 그래프 순환 의존 0개 | `npx tsx scripts/type-dep-graph/index.ts --json && npx tsx scripts/type-dep-graph/verify.ts` |
| N7 | clean install 후 정상 동작 | 절차: (1) DB 파일 삭제 (2) daemon 시작 (3) `setMasterSeed` (4) `wallet_create` 승인 (5) `sendTransaction` 실행 — 에러 없이 완료 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 미등록 accountIndex(예: 99)로 `sendTransaction` 호출 | `WalletNotFoundError` throw | unit test |
| E2 | MasterSeed 미설정 상태에서 도구 호출 | `NoMasterSeedError` throw | unit test |
| E3 | 이미 존재하는 accountIndex로 `wallet_create` | 에러 throw, 중복 생성 방지 | unit test |
| E4 | pending approval이 있는 wallet에 `wallet_delete` | 에러 throw, 삭제 거부 | unit test |
| E5 | 동일 tx + 동일 timestamp로 intentHash 충돌 (극히 희박) | 기존 레코드 유지, duplicate 반환 | unit test |
| E6 | wallet_delete 후 해당 accountIndex의 approval_history 조회 | history 정상 반환 (보존됨) | unit test |
| E7 | `setMasterSeed()` 2회 호출 (기존 니모닉 덮어쓰기) | 기존 니모닉 교체 | unit test |
| E8 | accountIndex 0번 wallet 삭제 후 재생성 | 정상 생성, 동일 accountIndex 재사용 가능 | unit test |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 니모닉 1개 + BIP-44 파생 계정 N개 | F1, F2, F3 | ✅ |
| AI가 accountIndex로 지갑 지정 | F11, F12, F15, F17 | ✅ |
| 지갑 생명주기를 Unified SignedApproval로 통합 | F5a, F5b, F6, F7, F16 | ✅ |
| metadata 제거 → 정규 필드 + content | F8a, F8b, F8c, F8d | ✅ |
| intentId 제거 → intentHash PK | F9, F10, F13 | ✅ |
| 기존 데이터 파기 (clean install) | N7 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| accountIndex(BIP-44 정수) | F2, F4, F11, F12 | ✅ |
| MasterSeed 테이블 (row 1개) | F1 | ✅ |
| wallet_delete hard cascade | F7, E6 | ✅ |
| pending_requests FK 없음 | F16 | ✅ |
| intentHash에 timestamp | F9 | ✅ |
| device_revoke 명칭 유지 | F5b | ✅ |
| wallet_name 단일 진실 원천 | F6 | ✅ |
| metadata 전면 제거 (패키지별) | F8a, F8b, F8c, F8d | ✅ |
