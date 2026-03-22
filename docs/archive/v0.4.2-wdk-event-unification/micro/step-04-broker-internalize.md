# Step 04: Broker에 후처리 내재화

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 03

---

## 1. 구현 내용 (design.md 기반)
- `ApprovalSubmitContext` discriminated union으로 `submitApproval()` 시그니처 변경
- policy_approval case: broker 내부에서 `store.savePolicy(context.policies, context.description)` 수행
- device_revoke case: broker 내부에서 `store.listSigners()` → `setTrustedApprovers(active)` 수행
- 기존 `VerificationContext` 용도를 `ApprovalSubmitContext`로 대체
- broker가 이미 store 접근 가능 (생성자에서 주입됨)

## 2. 완료 조건
- [ ] `submitApproval(signedApproval, context: ApprovalSubmitContext)` 시그니처
- [ ] policy case에서 `store.savePolicy()` 호출 (context.policies + pending.content 사용)
- [ ] device_revoke case에서 `store.listSigners()` + `this.setTrustedApprovers()` 호출
- [ ] 기존 `VerificationContext`가 `ApprovalSubmitContext`로 대체
- [ ] `tsc --noEmit` 통과 (guarded-wdk)

## 3. 롤백 방법
- git revert (signed-approval-broker.ts 시그니처 변경)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── signed-approval-broker.ts  # 수정 — submitApproval 시그니처 + policy/device_revoke 내재화
```

### Side Effect 위험
- daemon/src/control-handler.ts의 모든 submitApproval 호출부가 새 시그니처에 맞아야 함 → Step 05에서 처리
- guarded-wdk/tests/approval-broker.test.ts의 mock 호출부 수정 필요 → Step 07에서 처리

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 05: Control-Handler 단순화](step-05-control-handler-simplify.md)
