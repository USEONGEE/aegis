# DoD (Definition of Done) — v0.4.6 Store 경계 분리

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `ApprovalStore` 추상 클래스가 삭제되고 `WdkStore` 추상 클래스로 대체됨 (cron 4개 메서드 제거, abstract 키워드 사용) | `grep -r "class ApprovalStore" packages/` 결과 0건 + `grep -r "class WdkStore" packages/guarded-wdk/` 결과 1건 |
| F2 | `SqliteApprovalStore` → `SqliteWdkStore`, `JsonApprovalStore` → `JsonWdkStore`로 rename 완료 | `grep -r "ApprovalStore" packages/guarded-wdk/src/` 결과 0건 (import/export/class 모두) |
| F3 | `DaemonStore` interface가 `packages/daemon/src/daemon-store.ts`에 정의됨 (listCrons, saveCron, removeCron, updateCronLastRun, init, dispose — 6개 메서드) | 파일 존재 + `listCrons(accountIndex: number \| null)` 시그니처 확인 (optional 아님) |
| F4 | `SqliteDaemonStore`가 별도 SQLite 파일(`daemon.db`)로 cron 테이블을 관리 | daemon 기동 후 `daemon.db` 파일 생성 확인 + cron CRUD 테스트 통과 |
| F5 | rejection 기록이 WDK middleware 내부에서 자동 수행됨 — `sendTransaction`, `transfer`, `signTransaction` 3개 래퍼 모두 REJECT 시 `onRejection` 콜백 호출 | guarded-wdk 테스트: REJECT 판정 시 `onRejection` 콜백 호출 확인 + store에 rejection 레코드 존재 확인 |
| F6 | daemon의 tool-surface.ts에서 rejection 저장 코드가 완전 제거됨 | `grep -n "saveRejection\|getPolicyVersion" packages/daemon/src/tool-surface.ts` 결과 0건 |
| F7 | `ExecutionJournal` 클래스가 `packages/guarded-wdk/src/execution-journal.ts`로 이동되고 `packages/daemon/src/execution-journal.ts`가 삭제됨 | guarded-wdk 파일 존재 + daemon 파일 부재 |
| F8 | journal dedup이 `dedupKey` (timestamp 제외) 기준으로 동작 — 동일 tx 재전송 시 `DuplicateIntentError` throw | guarded-wdk 테스트: 같은 (chainId, to, data, value)로 2회 호출 시 2번째에서 `DuplicateIntentError` throw |
| F9 | `PolicyRejectionError`가 `intentHash` 필드를 포함하여 daemon에 전달됨 | guarded-wdk 테스트: REJECT 시 에러 객체의 `intentHash`가 non-empty string |
| F10 | `getApprovalStore()`, `getApprovalBroker()` (또는 `getBroker()`)가 facade에서 제거됨 | `grep -n "getApprovalStore\|getApprovalBroker\|getBroker" packages/guarded-wdk/src/guarded-wdk-factory.ts` 결과 0건 |
| F11 | facade에 읽기 메서드 추가됨: `loadPolicy`, `getPendingApprovals`, `listRejections`, `listPolicyVersions`, `listSigners`, `listWallets`, `listJournal` | facade 반환 객체에서 7개 메서드 호출 시 store 데이터 반환 (통합 테스트) |
| F12 | facade에 broker 흡수 메서드 추가됨: `submitApproval`, `createApprovalRequest`, `setTrustedApprovers` | facade 반환 객체에서 3개 메서드 존재 + submitApproval 호출 시 정상 동작 |
| F13 | daemon의 `WDKInitResult`가 단일 `facade` 필드만 반환 (wdk/broker/store 개별 필드 없음) | `packages/daemon/src/wdk-host.ts`에서 `WDKInitResult` 타입 확인: `{ facade: GuardedWDKFacade \| null }` |
| F14 | `@wdk-app/canonical`에 `dedupKey()` 함수 추가됨 (timestamp 제외 해시) | `grep "export function dedupKey" packages/canonical/src/index.ts` 결과 1건 |
| F15 | journal/rejection 데이터 모델에서 `targetHash` → `dedupKey` rename 완료 (`JournalInput`, `StoredJournal`, `RejectionEntry`, SQLite 컬럼, JSON 파일 키). approval domain의 `targetHash`(`SignedApproval`, `ApprovalRequest`, `HistoryEntry`)는 다른 개념이므로 유지 | `JournalInput.dedupKey` + `RejectionEntry.dedupKey` 확인. journal/rejection 테이블 컬럼이 `dedup_key`로 변경됨 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 컴파일 에러 0 (변경 대상 패키지) | `npx tsc -p packages/canonical/tsconfig.json --noEmit` + `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` + `npx tsc -p packages/daemon/tsconfig.json --noEmit` 모두 성공 |
| N2 | 신규 CI 체크 `daemon/no-direct-wdk-store-access` PASS + v0.4.6 변경으로 인한 새로운 CI 실패 없음 | `npm run check` 실행 후 신규 체크 PASS 확인. 기존에 FAIL이던 체크(dead-exports, no-public-verifier-export) 외에 새로운 FAIL이 없음 |
| N3 | daemon 패키지에서 `WdkStore`, `SqliteWdkStore`, `JsonWdkStore`, `ApprovalStore`, `SqliteApprovalStore`, `JsonApprovalStore` runtime import 0건 (wdk-host.ts의 SqliteWdkStore boot 예외 제외) | CI `daemon/no-direct-wdk-store-access` 체크 PASS |
| N4 | daemon 패키지에서 `getApprovalStore()`, `getApprovalBroker()` 메서드 호출 0건 | CI `daemon/no-direct-wdk-store-access` 체크 PASS (method-call 규칙) |
| N5 | WDK DB(`wdk.db`)와 daemon DB(`daemon.db`)가 별도 파일로 존재 | 파일 시스템 확인: 2개의 SQLite 파일이 다른 경로에 생성됨 |
| N6 | `JournalLogger` 인터페이스로 pino 직접 의존 회피 — guarded-wdk에 pino 의존 없음 | `grep "pino" packages/guarded-wdk/package.json` 결과 0건 |
| N7 | v0.4.6 변경으로 인한 새로운 테스트 실패 없음. daemon 테스트 전체 PASS. guarded-wdk 테스트는 v0.4.7 dead-exports 작업이 제거한 export로 인한 기존 suite link 실패 외 추가 실패 없음 | daemon: `npm test` 전체 PASS. guarded-wdk: tsc 통과 + v0.4.6 scope 내 로직 검증 통과 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `onRejection` 콜백이 실패(throw)해도 `PolicyRejectionError`는 정상 throw됨 | rejection 기록 실패해도 정책 거부 응답은 정상 반환 | guarded-wdk 테스트: onRejection이 throw하는 mock → PolicyRejectionError 정상 throw 확인 |
| E2 | journal이 null인 환경(journal 비활성)에서 sendTransaction이 정상 동작 | journal 없이도 tx 실행/rejection이 정상 작동 | guarded-wdk 테스트: `journal: null`로 middleware 생성 → sendTransaction 정상 실행 |
| E3 | daemon 기동 시 WDK seed가 없는 경우 `{ facade: null }` 반환 | daemon이 seed 없음을 정상 처리하고 WDK 기능 비활성 | daemon 테스트: seed 없는 store → initWDK 반환값의 facade === null |
| E4 | 동일 dedupKey로 연속 호출 시 2번째에서 `DuplicateIntentError` throw + 첫 번째 journal 레코드는 보존 | 중복 tx 방지 + 원본 기록 유지 | guarded-wdk 테스트: 2회 호출 → 2번째 DuplicateIntentError + listJournal 결과 1건 |
| E5 | `deleteWallet()` 호출 시 cron 관련 로직이 없음 (DaemonStore와 분리) | WdkStore의 deleteWallet이 cron 테이블을 건드리지 않음 | guarded-wdk 테스트: deleteWallet 후 daemon.db의 crons 테이블 무변경 |
| E6 | `JsonWdkStore`와 `JsonDaemonStore`가 별도 디렉토리에 파일 생성 | 테스트 환경에서 store 파일 격리 | guarded-wdk/daemon 테스트: 각 store 초기화 후 파일 경로 분리 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. ApprovalStore → WdkStore + DaemonStore 분리 | F1, F2, F3, F4, E5, E6 | ✅ |
| 2. WDK 내부화 (rejection, journal) | F5, F6, F7, F8, F9, F14, F15, E1, E2, E4 | ✅ |
| 3. facade 경유 강제 | F10, F11, F12, F13, N3, N4 | ✅ |
| 4. DaemonStore 최소화 (cron만) | F3, F4, E5 | ✅ |
| 5. Runtime import 경계 강제 | N2, N3, N4 | ✅ |
| 6. 런타임 DB 분리 | N5, F4 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| WdkStore abstract class (32개 메서드) | F1, F2 | ✅ |
| DaemonStore interface (6개 메서드) | F3 | ✅ |
| Rejection onRejection 콜백 | F5, F6, E1 | ✅ |
| ExecutionJournal guarded-wdk 이동 | F7, E2 | ✅ |
| dedupKey/intentHash 분리 | F8, F14, F15, E4 | ✅ |
| PolicyRejectionError intentHash 포함 | F9 | ✅ |
| Facade 통합 (10개 메서드) | F10, F11, F12 | ✅ |
| WDKInstance + Facade 단일 객체 | F13 | ✅ |
| CI runtime import 차단 | N2, N3, N4 | ✅ |
| 별도 SQLite 파일 | N5, F4 | ✅ |
| JournalLogger (pino 의존 회피) | N6 | ✅ |
| DB 폐기 정책 | F15 (rename 자유), N5 | ✅ |
