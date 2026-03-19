# Step 04: app executor type 분기 (Gap 10)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- `AppProviders.tsx`에서 현재 항상 `forTx()` 호출하는 부분을 `request.type`에 따라 분기
- 분기 로직:
  - `tx` → `SignedApprovalBuilder.forTx(...)`
  - `policy` → `SignedApprovalBuilder.forPolicy(...)`
  - `policy_reject` → `SignedApprovalBuilder.forPolicyReject(...)`
  - `device_revoke` → `SignedApprovalBuilder.forDeviceRevoke(...)`
- 각 builder 메서드가 이미 존재하는지 확인, 없으면 추가

## 2. 완료 조건
- [ ] `AppProviders.tsx`에 `switch (request.type)` 또는 동등한 분기 존재
- [ ] `forTx`, `forPolicy`, `forPolicyReject`, `forDeviceRevoke` 4개 경로 모두 존재
- [ ] 알 수 없는 type에 대한 에러 처리 존재
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: app 패키지만

---

## Scope

### 수정 대상 파일
```
packages/app/src/app/providers/
└── AppProviders.tsx             # request.type 기반 분기 로직 추가

packages/app/src/core/approval/
└── SignedApprovalBuilder.ts     # forPolicy, forPolicyReject, forDeviceRevoke 메서드 확인/추가
```

### Side Effect 위험
- 없음 (기존 forTx 경로는 그대로 유지)

## FP/FN 검증

### 검증 통과: ✅
- daemon은 request.type을 이미 설정하여 전송하므로 수정 불필요 (OK)

---

> 다음: [Step 05: E2E 세션 수립](step-05-e2e-session.md)
