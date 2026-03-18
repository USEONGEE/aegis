# Step 41: app - Approval 탭

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 37 (SignedApprovalBuilder)

---

## 1. 구현 내용 (design.md + PRD 기반)

Approval 탭 — pending tx 승인 대기 목록, tx 상세 뷰, approve/reject 버튼 + SignedApproval 생성.

- `src/domains/approval/screens/ApprovalScreen.tsx`: Approval 탭 메인 화면
- `src/stores/useApprovalStore.ts`: zustand 승인 상태

**Pending Tx Approval 리스트**:
- daemon에서 control_channel로 수신한 tx 승인 요청 목록
- 각 항목: chain, to, value, data 요약, 요청 시간, 만료까지 남은 시간 (카운트다운)
- expiresAt 기반 만료 카운트다운 (60초)
- 만료된 항목은 자동 제거 또는 "Expired" 표시

**Tx Detail View**:
- 항목 탭 → tx 상세 정보 표시 (모달 또는 확장 패널)
- chain, to (full address), value (ETH/token), data (selector + args 요약)
- requestId, intentHash 표시

**Approve/Reject 버튼**:
- Approve → SignedApprovalBuilder.forTxApproval() → SignedApproval 생성 → RelayClient.sendControl() 전송
- Reject → 거부 메시지 전송 → pending에서 제거

**SignedApproval 생성 (tx approval)**:
```typescript
SignedApprovalBuilder
  .forTxApproval({ targetHash: intentHash, chain, requestId, policyVersion })
  .withIdentity(identityKeyManager)
  .withDeviceId(deviceId)
  .withExpiry(60)
  .withNonce(nextNonce)
  .build()
```

**데이터 흐름**:
1. daemon → control_channel (tx_approval 요청) → RelayClient.onControl
2. useApprovalStore에 pending 추가
3. 사용자가 ApprovalScreen에서 항목 선택 → tx 상세 뷰
4. approve/reject → SignedApproval 생성 → RelayClient.sendControl() 전송
5. 승인/거부 후 리스트에서 제거

## 2. 완료 조건
- [ ] `src/domains/approval/screens/ApprovalScreen.tsx` 구현 (placeholder 대체)
- [ ] pending tx approval 리스트 표시 (FlatList)
- [ ] 각 항목에 chain, to, value, 요청 시간 표시
- [ ] 만료 카운트다운 표시 (expiresAt - now, 1초 간격 업데이트)
- [ ] 만료된 항목 자동 제거 또는 "Expired" 표시
- [ ] 항목 탭 → tx detail view (chain, to, value, data, requestId, intentHash)
- [ ] Approve 버튼 → SignedApprovalBuilder.forTxApproval() → RelayClient.sendControl()
- [ ] Reject 버튼 → 거부 전송 + pending에서 제거
- [ ] 승인/거부 후 리스트에서 제거
- [ ] `src/stores/useApprovalStore.ts` 생성 (zustand)
- [ ] pendingApprovals 배열 상태
- [ ] addPending, removePending, clearExpired 액션
- [ ] control_channel tx_approval 수신 시 addPending 연동
- [ ] 빈 리스트 시 "No pending approvals" placeholder

## 3. 롤백 방법
- `src/domains/approval/screens/ApprovalScreen.tsx`를 placeholder로 복원
- `src/stores/useApprovalStore.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/stores/
    useApprovalStore.ts            # zustand 승인 상태
```

### 수정 대상 파일
```
packages/app/src/domains/approval/screens/ApprovalScreen.tsx  # placeholder → 실제 구현
```

### Side Effect 위험
- ApprovalScreen.tsx 수정 — placeholder 대체
- SignedApprovalBuilder (Step 37), RelayClient (Step 36), IdentityKeyManager (Step 34) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ApprovalScreen.tsx | Approval 탭 UI (PRD Layer 5 Approval 탭) | ✅ OK |
| useApprovalStore.ts | 승인 상태 관리 (design.md stores/useApprovalStore.ts) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Pending tx approval 리스트 | ✅ ApprovalScreen.tsx | OK |
| Tx detail view | ✅ ApprovalScreen.tsx | OK |
| Approve/reject + SignedApproval 생성 | ✅ ApprovalScreen.tsx (SignedApprovalBuilder 호출) | OK |
| 만료 카운트다운 | ✅ ApprovalScreen.tsx | OK |
| control_channel 연동 | ✅ useApprovalStore.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 42: app - Activity 탭](step-42-activity-tab.md)
