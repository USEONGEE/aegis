# Step 04: loadPendingByRequestId 반환 타입 변경

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음 (Step 01-03과 독립, 단 Step 05보다 먼저 수행 권장 — 패턴 확립)

---

## 1. 구현 내용 (design.md Step D)
- `loadPendingByRequestId` 반환 타입: `PendingApprovalRow | null` → `PendingApprovalRequest | null`
- json/sqlite store 구현체: row를 읽은 뒤 camelCase 매핑 추가
- daemon/control-handler.ts: `pending.target_hash` → `pending.targetHash` 등 camelCase 접근
- store 테스트: `loadPendingByRequestId` 반환값 camelCase 키 assert 추가

## 2. 완료 조건
- [ ] `approval-store.ts`의 `loadPendingByRequestId` 시그니처에 `PendingApprovalRow` 없음 (DoD F7)
- [ ] json/sqlite store 테스트에서 `loadPendingByRequestId` 반환값이 `{ requestId, seedId, type, chainId, targetHash, createdAt }` camelCase (DoD F7)
- [ ] `grep -n 'PendingApprovalRow' packages/guarded-wdk/src/approval-store.ts` — import만, 반환 타입에 없음 (DoD N3)
- [ ] `pnpm --filter guarded-wdk test` — 6 suites pass (DoD N1)
- [ ] daemon tsc baseline 유지 (DoD N2)

## 3. 롤백 방법
- `git revert <commit>`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts        # loadPendingByRequestId 반환 타입 변경
├── json-approval-store.ts   # loadPendingByRequestId에 row → camelCase 매핑 추가
└── sqlite-approval-store.ts # 동일

packages/daemon/src/
└── control-handler.ts       # ApprovalStoreReader interface + snake_case → camelCase 접근

tests/
├── json-approval-store.test.ts  # loadPendingByRequestId 반환값 camelCase assert
└── sqlite-approval-store.test.ts # 동일
```

### Side Effect 위험
- control-handler.ts에서 snake_case 접근 3곳 → 누락 시 `undefined` 접근으로 조용히 실패 가능
- TS strict mode가 이를 잡아주지만, daemon의 로컬 interface가 `any`면 못 잡음 → interface 타입도 함께 수정

### 참고할 기존 패턴
- `loadPendingApprovals`의 `PendingApprovalRow → PendingApprovalRequest` 매핑 (json-approval-store.ts:140-148)

## FP/FN 검증

### False Positive (과잉)
| Scope 파일 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | loadPendingByRequestId 반환 타입 변경 | ✅ OK |
| json-approval-store.ts | row → camelCase 매핑 추가 | ✅ OK |
| sqlite-approval-store.ts | 동일 | ✅ OK |
| control-handler.ts | snake_case → camelCase 접근 + interface 수정 | ✅ OK |
| json-approval-store.test.ts | camelCase 반환값 assert | ✅ OK |
| sqlite-approval-store.test.ts | 동일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 반환 타입 변경 | ✅ | OK |
| store 매핑 추가 | ✅ | OK |
| daemon 접근 변경 | ✅ | OK |
| 반환값 테스트 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 05: CronRecord → CronRow + StoredCron](step-05-cron-public.md)
