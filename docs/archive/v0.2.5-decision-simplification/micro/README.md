# Micro Steps - v0.2.5

## 전체 현황

| Step | 설명 | 상태 | DoD 항목 |
|------|------|------|---------|
| 01 | 타입 변경 | ⏳ | F1, F2, F11, F12, F13, F20 |
| 02 | Middleware 단순화 | ⏳ | F3, F4, F5, F6, F7, F8 |
| 03 | Broker 정리 | ⏳ | F9, F10 |
| 04 | Store 구현 | ⏳ | F14, F15, F16, N7 |
| 05 | Daemon 변경 | ⏳ | F17, F18, F19, F21, F22 |
| 06 | Export + Guide | ⏳ | N6 |
| 07 | 테스트 + 최종 검증 | ⏳ | N1-N5, N7, E1-E7 |

## 의존성

```
Step 01 (타입) → Step 02 (middleware) → Step 03 (broker)
Step 01 (타입) → Step 04 (store)
Step 01 (타입) → Step 06 (exports)
Step 02, 03, 04 → Step 05 (daemon)
Step 01-06 → Step 07 (테스트)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | Step |
|----------|------|
| Decision 2가지 단순화 | 01, 02, 03, 05 |
| REJECT 이력 저장 | 01, 02, 04, 05 |
| 정책 버전 이력 도입 | 01, 04, 05, 06 |

### DoD → 티켓

| DoD | Step |
|-----|------|
| F1, F2, F11, F12, F13, F20 | 01 |
| F3, F4, F5, F6, F7, F8 | 02 |
| F9, F10 | 03 |
| F14, F15, F16 | 04 |
| F17, F18, F19, F21, F22 | 05 |
| N6 | 06 |
| N1-N5, N7, E1-E7 | 07 |

### 설계 결정 → 티켓

| 설계 결정 | Step |
|----------|------|
| Decision ALLOW/REJECT | 01, 02 |
| JournalStatus pending_approval 제거 | 01 |
| middleware approvalBroker 제거 | 02 |
| rejectionRecorder 주입 | 02, 05 |
| waitForApproval 삭제 | 02, 03 |
| tx_approval 폐기 | 05 |
| ApprovalRequested 폐기 | 02, 05 |
| savePolicy description 시그니처 | 01, 04, 05 |
| rejection_history store | 01, 04 |
| policy_versions store | 01, 04 |
| policyRequest reason→description | 05 |
| clean install | 04, 07(N7) |
