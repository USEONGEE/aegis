# DoD (Definition of Done) - v0.2.6

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | daemon `WDKInstance` 로컬 interface 제거 | `grep -c "interface WDKInstance" packages/daemon/src/wdk-host.ts` → 0 |
| F2 | `createMockWDK` 반환 타입이 derived boundary type과 호환 | N1 (tsc 통과) |
| F3 | `control-handler.ts`의 broker shadow (`submitApproval.*Record`) 제거 | `grep -c 'submitApproval.*Record' packages/daemon/src/control-handler.ts` → 0 |
| F4 | `_trustedApprovers` private 접근 제거 | `grep -c "_trustedApprovers" packages/daemon/src/control-handler.ts` → 0 |
| F5 | `tool-surface.ts`의 `broker: any`, `store: any` 제거 | `grep -c 'broker: any\|store: any' packages/daemon/src/tool-surface.ts` → 0 |
| F6 | `ApprovalStoreWriter` shadow interface 제거 | `grep -c "ApprovalStoreWriter" packages/daemon/src/control-handler.ts` → 0 |
| F7 | `execution-journal.ts`의 `JournalEntry`/`JournalListOptions` shadow 제거 | `grep -c 'interface JournalEntry\|interface JournalListOptions' packages/daemon/src/execution-journal.ts` → 0 |
| F8 | `admin-server.ts`에서 로컬 shadow 타입 대신 shared export 사용 | N1 (tsc 통과) |
| F9 | relay: `ApprovalGranted` 제거 | `grep -c "ApprovalGranted" packages/daemon/src/index.ts` → 0 |
| F10 | relay: `TransactionSigned`/`WalletCreated`/`WalletDeleted` 추가 | `grep -c 'TransactionSigned\|WalletCreated\|WalletDeleted' packages/daemon/src/index.ts` → 3 |
| F11 | `handleControlMessage` `wdk` 파라미터 제거 | `grep -c 'wdk?:' packages/daemon/src/control-handler.ts` → 0 |
| F12 | wire payload → `SignedApproval` 명시적 매핑 함수 | `grep "toSignedApproval" packages/daemon/src/control-handler.ts` → 1건 이상 |
| F13 | guarded-wdk internal path import 0건 | `grep -c "guarded-wdk/src/" packages/daemon/src/*.ts` → 0 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | daemon tsc에서 guarded-wdk 경계 에러 0건 | `cd packages/daemon && npx tsc --noEmit 2>&1 \| grep 'error TS' \| grep -c 'wdk-host\|control-handler\|tool-surface\|execution-journal\|admin-server\|cron-scheduler'` → 0 (boundary 파일만 검사) |
| N2 | daemon 테스트 통과 | `cd packages/daemon && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js` |
| N3 | `tx_approval` 테스트 잔재 제거 | `grep -c "tx_approval" packages/daemon/tests/control-handler.test.ts` → 0 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | mock WDK fallback 경로 | `createMockWDK` 반환값이 boundary type에 할당 가능 | N1 (tsc에서 mock 타입도 검증) |
| E2 | signer revocation 후 trusted approvers 재구성 | `store.listSigners()` → `setTrustedApprovers()` 패턴 | N2 (테스트 통과) |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| shadow interface 제거 + public export 의존 | F1, F3, F5, F6, F7, F8, F13 | ✅ |
| guarded-wdk 경계 tsc 에러 0건 | N1 | ✅ |
| relay event 정합 | F9, F10 | ✅ |
| v0.2.5 잔재 cleanup | N3 | ✅ |
