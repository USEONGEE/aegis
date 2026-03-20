# Micro Steps - v0.2.2

## 전체 현황

| Step | 설명 | 상태 | DoD 항목 |
|------|------|------|---------|
| 01 | MiddlewareConfig + middleware 내부 | ⏳ | F1, F2, F3, F4, F13 |
| 02 | Factory 변경 | ⏳ | F5, F6, F7, F8, F15, F16 |
| 03 | Daemon 소비자 변경 | ⏳ | F9, F10, F11, F12, F14 |
| 04 | Export 정리 + Guide 문서 | ⏳ | F3(export), F4(export), N6 |
| 05 | 테스트 수정 + 최종 검증 | ⏳ | N1-N5, E1-E5 |

## 의존성

```
Step 01 (middleware) → Step 02 (factory) → Step 03 (daemon) → Step 04 (exports) → Step 05 (tests)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | Step |
|----------|------|
| middleware가 policyResolver로 직접 조회 | 01, 02 |
| ChainPolicies/ChainPolicyConfig 삭제 | 01, 04 |
| policiesStore 캐시 삭제 | 02 |
| swapPoliciesForWallet 삭제 | 03 |

### DoD → 티켓

| DoD | Step |
|-----|------|
| F1, F2, F3, F4, F13 | 01 |
| F5, F6, F7, F8, F15, F16 | 02 |
| F9, F10, F11, F12, F14 | 03 |
| F3(export), F4(export), N6 | 04 |
| N1-N5, E1-E5 | 05 |

### 설계 결정 → 티켓

| 설계 결정 | Step |
|----------|------|
| policyResolver(chainId) 시그니처 | 01 |
| accountIndex closure 흡수 | 01, 02 |
| config.policies 삭제 | 02 |
| approvalStore 필수 | 02 |
| updatePolicies 삭제 | 02, 03 |
| control-handler writer interface | 03 |
| validatePolicies 유지 | 02 |
| wdk-host 정책 복원 삭제 | 03 |
