# Step 09: Tool Result Null Cleanup

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `SendTransactionExecuted.hash`: `string | null` → `string`
- `SendTransactionExecuted.fee`: `string | null` → `string`
- `SignTransactionSigned.signedTx`: `string | null` → `string`
- `ToolAccount` 인터페이스 strict화 (guarded-middleware TransactionResult과 일관)
- `|| null` fallback 제거 (tool-surface.ts:289, 316, 462)

## 2. 완료 조건
- [ ] `rg 'hash.*null|fee.*null|signedTx.*null' packages/daemon/src/tool-surface.ts` result 관련 0건
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] tool-surface 테스트에서 hash, fee, signedTx non-null assertion
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── tool-surface.ts    # result 타입 변경, || null 제거
└── wdk-host.ts        # ToolAccount 인터페이스

packages/daemon/tests/
└── tool-surface.test.ts  # hash, fee, signedTx non-null assertion (E11)
```

### Side Effect 위험
- 외부 WDK 의존성 경계 — guarded-middleware의 TransactionResult이 이미 non-null이므로 일관

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-surface.ts | result 타입 + fallback 제거 | ✅ OK |
| wdk-host.ts | ToolAccount 인터페이스 | ✅ OK |
| tool-surface.test.ts | E11 non-null assertion | ✅ OK |

### False Negative (누락)
없음 — `rg 'hash.*null\|fee.*null\|signedTx.*null' packages/daemon/src/` 확인

### 검증 통과: ✅

---

→ Phase 완료
