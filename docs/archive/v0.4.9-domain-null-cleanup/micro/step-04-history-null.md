# Step 04: History Null Removal

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `HistoryEntry.signedApproval`: `SignedApproval | null` → `SignedApproval` (null path 없으므로 타입만 변경)
- `HistoryEntry.chainId`: `number | null` → `number` (signedApproval.chainId에서 항상 유래)
- Store 구현: DB null row 방어 (E2, E3 엣지케이스)

## 2. 완료 조건
- [ ] `rg 'signedApproval.*null|chainId.*null' packages/guarded-wdk/src/wdk-store.ts` HistoryEntry 관련 0건
- [ ] DB `signed_approval_json = NULL` row → skip (결과에서 제외)
- [ ] DB `chain_id = NULL` row → signedApproval에서 복원, 불가 시 skip
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts           # HistoryEntry 타입 변경
├── sqlite-wdk-store.ts    # DB row → 도메인 변환, null row skip
└── json-wdk-store.ts      # 동일

packages/guarded-wdk/tests/
├── sqlite-wdk-store.test.ts  # null row skip 테스트 (E2, E3)
└── json-wdk-store.test.ts    # 동일
```

### Side Effect 위험
- Legacy null row가 결과에서 제외됨 — 데이터 손실 아닌 필터링 (bogus 데이터 방지)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| wdk-store.ts | HistoryEntry 타입 정의 | ✅ OK |
| sqlite-wdk-store.ts | DB → 도메인 변환 + null skip | ✅ OK |
| json-wdk-store.ts | 동일 | ✅ OK |
| sqlite-wdk-store.test.ts | E2, E3 엣지케이스 테스트 | ✅ OK |
| json-wdk-store.test.ts | 동일 | ✅ OK |

### False Negative (누락)
없음 — signedApproval/chainId는 wdk-store + store 구현에만 정의

### 검증 통과: ✅

---

→ 다음: [Step 05: Cron ChainScope DU](step-05-chain-scope.md)
