# Step 40: app - Policy 탭

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 37 (SignedApprovalBuilder)

---

## 1. 구현 내용 (design.md + PRD 기반)

Policy 탭 — active policy 리스트 (체인별), pending policy 승인/거부, manifest 기반 policy 생성 UI.

- `src/domains/policy/screens/PolicyScreen.tsx`: Policy 탭 메인 화면
- `src/stores/usePolicyStore.ts`: zustand policy 상태 (active policies, pending policies)

**Active Policy 리스트 (per chain)**:
- 체인별 active policy 표시 (chain, target, selector, decision, constraints)
- daemon에서 Relay control_channel을 통해 수신한 policy 상태
- policyVersion 표시

**Pending Policy + Approve/Reject 버튼**:
- AI가 요청한 pending policy 표시 (chain, reason, policies 내역)
- 각 pending policy에 Approve / Reject 버튼
- Approve → SignedApprovalBuilder.forPolicyApproval() → SignedApproval 생성 → RelayClient.sendControl() 전송
- Reject → SignedApprovalBuilder.forPolicyReject() → SignedApproval 생성 → RelayClient.sendControl() 전송

**Manifest 기반 Policy 생성 UI**:
- @wdk-app/manifest의 getPolicyManifest() 호출 → 프로토콜별 feature 목록 표시
- feature 선택 (체크박스) + decision 설정 (AUTO / REQUIRE_APPROVAL)
- condition 설정 (maxAmount, allowedTokens 등 feature에 따라)
- 선택된 feature → manifestToPolicy() 변환 → policy 배열 생성
- policyHash 계산 (@wdk-app/canonical) → SignedApproval 생성 → control_channel로 전송

**SignedApproval 생성 (policy approve/reject)**:
```typescript
// Approve
SignedApprovalBuilder
  .forPolicyApproval({ targetHash: policyHash, chain, requestId })
  .withIdentity(identityKeyManager)
  .withDeviceId(deviceId)
  .withExpiry(60)
  .withNonce(nextNonce)
  .build()

// Reject
SignedApprovalBuilder
  .forPolicyReject({ targetHash: policyHash, chain, requestId })
  .withIdentity(identityKeyManager)
  .withDeviceId(deviceId)
  .withExpiry(60)
  .withNonce(nextNonce)
  .build()
```

## 2. 완료 조건
- [ ] `src/domains/policy/screens/PolicyScreen.tsx` 구현 (placeholder 대체)
- [ ] Active policy 리스트: 체인별 policy 표시 (chain, target, selector, decision)
- [ ] policyVersion 표시
- [ ] Pending policy 리스트: AI가 요청한 pending policy 표시
- [ ] pending policy에 reason (AI가 요청한 사유) 표시
- [ ] Approve 버튼 → SignedApprovalBuilder.forPolicyApproval() → RelayClient.sendControl()
- [ ] Reject 버튼 → SignedApprovalBuilder.forPolicyReject() → RelayClient.sendControl()
- [ ] Manifest 기반 policy 생성: feature 선택 UI
- [ ] feature별 decision 설정 (AUTO / REQUIRE_APPROVAL)
- [ ] condition 설정 UI (feature에 따라 동적)
- [ ] manifestToPolicy() 변환 → policyHash 계산 → SignedApproval 생성 → 전송
- [ ] `src/stores/usePolicyStore.ts` 생성 (zustand)
- [ ] activePolicies: Record<chain, Policy[]> 상태
- [ ] pendingPolicies: PendingRequest[] 상태
- [ ] fetchPolicies(), fetchPending() — RelayClient 경유
- [ ] RelayClient.onControl에서 policy_update 수신 시 activePolicies 갱신
- [ ] 승인/거부 후 pending 목록에서 제거

## 3. 롤백 방법
- `src/domains/policy/screens/PolicyScreen.tsx`를 placeholder로 복원
- `src/stores/usePolicyStore.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/stores/
    usePolicyStore.ts              # zustand policy 상태 (active + pending)
```

### 수정 대상 파일
```
packages/app/src/domains/policy/screens/PolicyScreen.tsx  # placeholder → 실제 구현
packages/app/package.json                                 # @wdk-app/manifest 의존성 추가
```

### Side Effect 위험
- PolicyScreen.tsx 수정 — placeholder 대체
- SignedApprovalBuilder (Step 37), RelayClient (Step 36), IdentityKeyManager (Step 34) 의존
- @wdk-app/manifest, @wdk-app/canonical 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| PolicyScreen.tsx | Policy 탭 UI (PRD Layer 5 Policy 탭) | ✅ OK |
| usePolicyStore.ts | policy 상태 관리 (design.md stores/usePolicyStore.ts) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Active policy 리스트 (per chain) | ✅ PolicyScreen.tsx | OK |
| Pending policy approve/reject | ✅ PolicyScreen.tsx + usePolicyStore.ts | OK |
| SignedApproval 생성 (policy type) | ✅ PolicyScreen.tsx (SignedApprovalBuilder 호출) | OK |
| Manifest 기반 policy 생성 UI | ✅ PolicyScreen.tsx (@wdk-app/manifest) | OK |
| policyHash 계산 | ✅ PolicyScreen.tsx (@wdk-app/canonical) | OK |

### 검증 통과: ✅

---

→ 다음: [Step 41: app - Approval 탭](step-41-approval-tab.md)
