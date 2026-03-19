# Step 01: Row 내부 타입 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md TD-2, TD-3, TD-5 기반)
- `store-types.ts`에 `DeviceRow`, `SeedRow`, `PolicyRow` 추가 (`@internal` JSDoc)
- 기존 타입(`PendingApprovalRow`, `StoredHistoryEntry`, `CronRow`, `StoredJournalEntry`)은 변경 없음

## 2. 완료 조건
- [ ] `store-types.ts`에 `DeviceRow` interface 존재 (snake_case, `@internal`)
- [ ] `store-types.ts`에 `SeedRow` interface 존재 (snake_case, `@internal`)
- [ ] `store-types.ts`에 `PolicyRow` interface 존재 (snake_case, `@internal`)
- [ ] 기존 타입 변경 없음
- [ ] `pnpm --filter guarded-wdk test` 통과 (기존 테스트 미영향)

## 3. 롤백 방법
- `store-types.ts` 변경 revert (추가만 했으므로 안전)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── store-types.ts  # 수정 - DeviceRow, SeedRow, PolicyRow 추가
```

### 신규 생성 파일
없음

### Side Effect 위험
없음 - 타입 추가만

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| store-types.ts | DeviceRow, SeedRow, PolicyRow 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| DeviceRow 추가 | ✅ store-types.ts | OK |
| SeedRow 추가 | ✅ store-types.ts | OK |
| PolicyRow 추가 | ✅ store-types.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: public 타입 재정의](step-02-public-types.md)
