# Step 02: public 타입 재정의 + ApprovalStore 시그니처

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md TD-2~TD-5, TD-8 기반)
- `approval-store.ts`:
  - `DeviceRecord` → `StoredDevice` (camelCase)
  - `SeedRecord` → `StoredSeed` (camelCase, `isActive: boolean`)
  - `JournalEntry` → `StoredJournal` (rename only, 이미 camelCase)
  - `StoredPolicy` camelCase 전환 (`seedId`, `chainId`, `policiesJson`, `signatureJson`, `policyVersion`, `updatedAt`)
  - `ApprovalStore` 추상 클래스: 반환 타입을 `StoredDevice`, `StoredSeed`, `StoredJournal`, `StoredPolicy`(camelCase)로 변경
- `index.ts`: export 업데이트 (`StoredJournal`, `StoredDevice`, `StoredSeed` 추가, 구 이름 제거)

## 2. 완료 조건
- [ ] `StoredDevice` interface 존재 (camelCase 필드)
- [ ] `StoredSeed` interface 존재 (camelCase 필드, `isActive: boolean`)
- [ ] `StoredJournal` interface 존재 (기존 JournalEntry 필드 유지)
- [ ] `StoredPolicy` 필드가 camelCase
- [ ] `ApprovalStore` 모든 메서드 반환 타입이 새 타입 사용
- [ ] `index.ts`에서 `StoredJournal`, `StoredDevice`, `StoredSeed` export
- [ ] `index.ts`에서 `JournalEntry`, `DeviceRecord`, `SeedRecord` 미export

## 3. 롤백 방법
- `approval-store.ts`, `index.ts` 변경 revert

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts  # 수정 - 타입 재정의 + 시그니처 변경
└── index.ts           # 수정 - export 업데이트
```

### Side Effect 위험
- **store 구현체 컴파일 에러**: 반환 타입 변경으로 json/sqlite store가 깨짐 → Step 03에서 수정

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | 타입 재정의 + 시그니처 변경 | ✅ OK |
| index.ts | export 업데이트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| StoredDevice 정의 | ✅ approval-store.ts | OK |
| StoredSeed 정의 | ✅ approval-store.ts | OK |
| StoredJournal 정의 | ✅ approval-store.ts | OK |
| StoredPolicy camelCase | ✅ approval-store.ts | OK |
| ApprovalStore 시그니처 | ✅ approval-store.ts | OK |
| export 업데이트 | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: store 구현체 매핑](step-03-store-mapping.md)
