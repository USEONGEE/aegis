# DoD (Definition of Done) - v0.1.6

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `SignedPolicy`가 `PolicyInput { policies: unknown[], signature: Record<string, unknown> }`으로 rename되고, `savePolicy` 입력이 parsed 형태를 받음 | `grep -rn 'SignedPolicy' packages/guarded-wdk/src/ packages/daemon/src/` 결과 0건 (StoredPolicy 제외) |
| F2 | `StoredPolicy`가 독립 타입으로 정의됨 (extends 없음) | `approval-store.ts`에서 `extends SignedPolicy` 또는 `extends PolicyInput` 없음 확인 |
| F3 | `savePolicy`의 직렬화(`JSON.stringify`)가 store 구현체 내부에서 수행됨 | `json-approval-store.ts`, `sqlite-approval-store.ts`의 `savePolicy`에서 `JSON.stringify(input.policies)` 존재 확인 |
| F4 | `CronInput`에서 `id`, `createdAt` 필드가 제거되고 `sessionId`, `chainId`가 required | `approval-store.ts`의 `CronInput` 필드 목록: `sessionId: string`, `interval: string`, `prompt: string`, `chainId: number \| null` (정확히 4개, `?` 없음) |
| F5 | `JournalEntry`가 `JournalInput`(생성) + `JournalEntry`(저장)로 분리됨 | `approval-store.ts`에 `JournalInput` 정의 존재, `saveJournalEntry` 파라미터가 `JournalInput` |
| F6 | `JournalInput` 필드가 정확히 `intentId: string, seedId: string, chainId: number, targetHash: string, status: string` (5개, `?` 없음) | `approval-store.ts`의 `JournalInput` 필드 확인 |
| F7 | `loadPendingByRequestId` 반환 타입이 `PendingApprovalRequest`이고, 두 store 구현체가 실제 camelCase 객체를 반환 | 시그니처 확인 + json/sqlite store 테스트에서 `loadPendingByRequestId` 반환값이 `{ requestId, seedId, type, chainId, targetHash, createdAt }` camelCase 키를 가짐을 assert |
| F8 | `CronRecord`가 `CronRow`로 rename되고, public `StoredCron` (camelCase) 타입 도입 | `grep -rn 'CronRecord' packages/guarded-wdk/` 결과 0건, `store-types.ts`에 `CronRow`, `approval-store.ts`에 `StoredCron` |
| F9 | `listCrons` 반환 타입이 `StoredCron[]`이고, 두 store 구현체가 실제 camelCase 객체를 반환 | 시그니처 확인 + json/sqlite store 테스트에서 `listCrons` 반환값이 `{ id, seedId, sessionId, interval, prompt, chainId, createdAt, lastRunAt, isActive }` camelCase 키를 가짐을 assert |
| F10 | `index.ts`에서 `PolicyInput`, `JournalInput`, `StoredCron` export | `grep -n 'PolicyInput\|JournalInput\|StoredCron' packages/guarded-wdk/src/index.ts` |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk 테스트 전체 pass | `pnpm --filter guarded-wdk test` — 6 suites pass |
| N2 | daemon TypeScript 컴파일 에러 증가 없음 | `cd packages/daemon && npx tsc --noEmit 2>&1 \| grep -E 'control-handler\|cron-scheduler\|tool-surface\|wdk-host' \| grep 'error TS'` — 기존 baseline: wdk-host.ts(101) TS2322 1건만. 그 외 신규 에러 0건 |
| N3 | `@internal` store-types.ts 타입이 public API 반환 타입에 노출되지 않음 | `grep -n 'PendingApprovalRow\|CronRow' packages/guarded-wdk/src/approval-store.ts`에서 import만 존재, 메서드 반환 타입에 없음 |
| N4 | `approval-store.ts` 대상 입력 타입에 optional(`?`) 필드 없음 | `PolicyInput`, `CronInput`, `JournalInput` 각각 `?` 없음 확인 |
| N5 | 기존 구 타입명 잔존 없음 | `grep -rn 'SignedPolicy\|CronRecord' packages/guarded-wdk/src/ packages/daemon/src/` (StoredPolicy 제외) 결과 0건 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `savePolicy`에 빈 policies 배열 전달 | store가 `JSON.stringify([])` → `'[]'` 저장, loadPolicy에서 복원 | store 테스트에서 빈 배열 savePolicy → loadPolicy round-trip 확인 |
| E2 | `saveCron`에 `chainId: null` 전달 | store가 `null` 그대로 저장, listCrons에서 `chainId: null` 반환 | store 테스트에서 `chainId: null` saveCron → listCrons round-trip (현재 테스트에 없으므로 추가 필요) |
| E3 | `listCrons` 반환의 `isActive` 타입이 `boolean` | store가 `is_active: 1` → `isActive: true`, `0` → `false` 매핑 | store 테스트에서 `typeof cron.isActive === 'boolean'` 확인 |
| E4 | daemon `CronStore.listCrons` 타입이 `StoredCron[]`로 좁힘 | cron-scheduler.ts의 snake_case 접근이 camelCase로 변경됨 | N2와 동일 명령 + `grep -n 'is_active\|session_id\|chain_id\|last_run_at' packages/daemon/src/cron-scheduler.ts` 결과 0건 |

## PRD 목표 → DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. public API에서 @internal row 노출 제거 | F7, F8, F9, N3 | ✅ |
| 2. SignedPolicy 분리 | F1, F2, F3 | ✅ |
| 3. JournalEntry 분리 | F5, F6 | ✅ |
| 4. CronRecord rename + StoredCron | F8, F9, E3 | ✅ |
| 5. CronInput optional 정리 | F4, E2 | ✅ |

## 설계 결정 → DoD 반영

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| PolicyInput parsed form + store가 직렬화 | F1, F3, E1 | ✅ |
| JournalInput/JournalEntry 분리 | F5, F6 | ✅ |
| CronRow + StoredCron (internal/public 분리) | F8, F9, N3 | ✅ |
| loadPendingByRequestId → PendingApprovalRequest (실제 매핑 포함) | F7, N3 | ✅ |
| CronStore.listCrons any[] → StoredCron[] | E4, N2 | ✅ |
| Breaking Change 허용 | N5 (구 타입명 잔존 없음) | ✅ |
