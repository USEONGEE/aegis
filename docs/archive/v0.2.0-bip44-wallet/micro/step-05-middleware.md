# Step 05: guarded-middleware 연동

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01, Step 04

---

## 1. 구현 내용 (design.md 기반)
- `guarded-middleware.ts`에서 `intentHash` 호출 시 `timestamp: Date.now()` 추가
- `SignTransactionResult`에서 `intentId` → `intentHash` 교체
- `guarded-wdk/index.ts` export 정리

## 2. 완료 조건
- [ ] `intentHash` 호출부에 `timestamp` 전달
- [ ] `SignTransactionResult.intentId` 제거, `intentHash` 유지
- [ ] `cd packages/guarded-wdk && npx tsc --noEmit` 에러 0
- [ ] `cd packages/guarded-wdk && npm test` 전체 통과

## 3. 롤백 방법
- `git revert`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts   # intentHash 호출에 timestamp 추가, SignTransactionResult 수정
└── index.ts                # export 정리
```

## FP/FN 검증
- Scope 2파일 모두 구현 내용에 직접 근거 있음 → FP 없음
- 구현 내용의 모든 항목이 Scope에 반영됨 → FN 없음
- **검증 통과: ✅**

---

→ 다음: [Step 06: daemon 전면 연동](step-06-daemon.md)
