# Step 05: CronRecord → CronRow + StoredCron

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 04 완료 권장 (동일 패턴 — internal row → public mapped type)

---

## 1. 구현 내용 (design.md Step E)
- `CronRecord` → `CronRow` rename (store-types.ts, @internal 유지)
- `StoredCron` 신규 (approval-store.ts, public camelCase, `isActive: boolean`)
- `listCrons` 반환 타입: `CronRecord[]` → `StoredCron[]`
- json/sqlite store: `listCrons`에서 `CronRow → StoredCron` 매핑 (snake_case → camelCase + `is_active: number → isActive: boolean`)
- daemon/cron-scheduler.ts: `CronStore.listCrons` 타입 `any[]` → `StoredCron[]`, snake_case 접근 → camelCase
- `index.ts`: `StoredCron` export 추가
- store 테스트: `listCrons` 반환값 camelCase 키 + `isActive` boolean assert

## 2. 완료 조건
- [ ] `grep -rn 'CronRecord' packages/guarded-wdk/` 결과 0건 (DoD F8)
- [ ] `store-types.ts`에 `CronRow`, `approval-store.ts`에 `StoredCron` 존재 (DoD F8)
- [ ] `listCrons` 시그니처 `StoredCron[]` (DoD F9)
- [ ] json/sqlite store 테스트에서 `listCrons` 반환값이 camelCase 키 (`seedId`, `sessionId`, `chainId`, `createdAt`, `lastRunAt`, `isActive`) assert (DoD F9)
- [ ] store 테스트에서 `typeof cron.isActive === 'boolean'` 확인 (DoD E3)
- [ ] `grep -n 'is_active\|session_id\|chain_id\|last_run_at' packages/daemon/src/cron-scheduler.ts` 결과 0건 (DoD E4)
- [ ] `grep -n 'StoredCron' packages/guarded-wdk/src/index.ts` (DoD F10)
- [ ] `pnpm --filter guarded-wdk test` — 6 suites pass (DoD N1)
- [ ] daemon tsc baseline 유지 (DoD N2)
- [ ] `grep -rn 'CronRecord' packages/guarded-wdk/src/ packages/daemon/src/` 결과 0건 (DoD N5)

## 3. 롤백 방법
- `git revert <commit>`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── store-types.ts           # CronRecord → CronRow rename
├── approval-store.ts        # StoredCron 신규, listCrons 반환 타입, import CronRow
├── json-approval-store.ts   # listCrons 매핑, 내부 CronRow 사용
├── sqlite-approval-store.ts # 동일
└── index.ts                 # StoredCron export 추가

packages/daemon/src/
├── cron-scheduler.ts        # CronStore.listCrons: any[] → StoredCron[], snake_case → camelCase
└── tool-surface.ts          # listCrons 반환이 camelCase가 되므로 변경 최소

tests/
├── json-approval-store.test.ts  # last_run_at → lastRunAt, isActive boolean
└── sqlite-approval-store.test.ts # 동일
```

### Side Effect 위험
- cron-scheduler.ts의 `start()`에서 snake_case 접근 6곳 → `CronStore` 타입을 `StoredCron[]`로 좁히면 tsc가 검출
- `isActive` 타입 변경 (`number → boolean`): `if (cron.is_active)` → `if (cron.isActive)` — 동작 동일하나 타입 레벨 변경

### 참고할 기존 패턴
- Step 04의 `loadPendingByRequestId` 매핑 패턴과 동일

## FP/FN 검증

### False Positive (과잉)
| Scope 파일 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| store-types.ts | CronRecord → CronRow rename | ✅ OK |
| approval-store.ts | StoredCron 신규, listCrons 반환 타입 | ✅ OK |
| json-approval-store.ts | listCrons 매핑, CronRow 사용 | ✅ OK |
| sqlite-approval-store.ts | 동일 | ✅ OK |
| index.ts | StoredCron export | ✅ OK |
| cron-scheduler.ts | CronStore 타입 좁힘 + camelCase 변경 | ✅ OK |
| tool-surface.ts | listCrons 반환 camelCase (변경 최소) | ✅ OK |
| json-approval-store.test.ts | camelCase 반환값 + isActive boolean | ✅ OK |
| sqlite-approval-store.test.ts | 동일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| CronRow rename | ✅ | OK |
| StoredCron 도입 | ✅ | OK |
| listCrons 매핑 | ✅ | OK |
| CronStore 타입 좁힘 | ✅ | OK |
| snake_case → camelCase | ✅ | OK |
| isActive boolean 매핑 | ✅ | OK |

### 검증 통과: ✅

---

→ 완료: 모든 Step 완료 후 DoD 전체 검증
