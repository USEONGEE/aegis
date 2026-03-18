# Step 38: app - TxApprovalContext + TxApprovalSheet

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 37 (SignedApprovalBuilder)

---

## 1. 구현 내용 (design.md + HypurrQuant 레퍼런스 기반)

TxApprovalContext 상태 머신 + TxApprovalSheet 바텀시트 UI + PendingIndicator. HypurrQuant 패턴 차용.

**TxApprovalContext** (`src/shared/tx/TxApprovalContext.tsx`):
- 상태 머신: `idle → pending → signing → success | error`
- pending: daemon에서 승인 요청 수신 (control_channel tx_approval)
- signing: 사용자가 approve → SignedApprovalBuilder로 서명 중
- success: 서명 완료 → RelayClient로 전송 완료
- error: 서명 실패 또는 전송 실패
- React Context + Provider 패턴 (HypurrQuant TxApprovalContext 참조)
- 큐 지원: 여러 승인 요청이 동시에 올 수 있으므로 pending 큐 관리

**TxApprovalSheet** (`src/shared/tx/TxApprovalSheet.tsx`):
- 바텀시트 UI (@gorhom/bottom-sheet, HypurrQuant TxApprovalSheet 패턴)
- pending content: tx 상세 표시 (chain, to, value, data summary)
- signing spinner: ActivityIndicator 로딩 표시
- success checkmark: 체크마크 애니메이션 + 2초 자동 dismiss
- error retry/skip: 에러 메시지 + Retry/Skip 버튼
- Approve / Reject 버튼

**PendingIndicator** (`src/shared/tx/PendingIndicator.tsx`):
- 탭 바 위 또는 화면 상단에 표시되는 floating badge
- pending 승인 요청 수 표시 (예: "2 pending")
- 탭하면 TxApprovalSheet 오픈
- pending 없으면 숨김

**상태 전이**:
```
idle ──(approval request received)──► pending
pending ──(user taps Approve)──► signing
pending ──(user taps Reject)──► idle (reject SignedApproval 전송)
signing ──(sign success)──► success
signing ──(sign failure)──► error
success ──(dismiss / 2초 자동)──► idle
error ──(retry)──► signing
error ──(skip)──► idle (다음 큐 항목으로)
```

## 2. 완료 조건
- [ ] `src/shared/tx/TxApprovalContext.tsx` 생성
- [ ] 상태 머신 5종 상태: idle, pending, signing, success, error
- [ ] `requestApproval(request)` → idle → pending 전이 (큐에 추가)
- [ ] `approve()` → pending → signing → SignedApprovalBuilder 호출 → success/error
- [ ] `reject()` → pending → idle (policy_reject SignedApproval 전송)
- [ ] `dismiss()` → success/error → idle (큐에 다음 항목 있으면 → pending)
- [ ] `retry()` → error → signing (재시도)
- [ ] RelayClient 연동: control_channel에서 tx_approval 수신 시 requestApproval() 호출
- [ ] RelayClient 연동: approve 시 SignedApproval을 control_channel로 전송
- [ ] `src/shared/tx/TxApprovalSheet.tsx` 생성
- [ ] 바텀시트 UI: pending 시 자동 팝업 (@gorhom/bottom-sheet)
- [ ] pending content: chain, to, value, data (요약)
- [ ] signing spinner: ActivityIndicator 로딩 표시
- [ ] success checkmark: 체크마크 + 2초 자동 dismiss
- [ ] error: 에러 메시지 + Retry/Skip 버튼
- [ ] Approve 버튼 → approve() 호출
- [ ] Reject 버튼 → reject() 호출
- [ ] `src/shared/tx/PendingIndicator.tsx` 생성
- [ ] pending 큐 개수 표시 (floating badge)
- [ ] 탭 시 TxApprovalSheet 오픈
- [ ] pending 없으면 숨김
- [ ] `npm test` 통과 (상태 전이 테스트)

## 3. 롤백 방법
- `src/shared/tx/` 디렉토리 삭제
- AppProviders.tsx에서 TxApprovalProvider 제거

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/shared/
    tx/
      TxApprovalContext.tsx         # 상태 머신 + Context/Provider + 큐
      TxApprovalSheet.tsx           # 바텀시트 UI (pending/signing/success/error)
      PendingIndicator.tsx          # floating badge (pending 개수)
  tests/
    tx-approval-context.test.tsx    # 상태 전이 테스트
```

### 수정 대상 파일
```
packages/app/src/app/providers/AppProviders.tsx  # TxApprovalProvider 추가
packages/app/package.json                        # @gorhom/bottom-sheet 의존성 추가
```

### Side Effect 위험
- AppProviders.tsx 수정 — Provider 트리에 TxApprovalProvider 추가
- SignedApprovalBuilder (Step 37), RelayClient (Step 36) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| TxApprovalContext.tsx | 상태 머신 (HypurrQuant 패턴) | ✅ OK |
| TxApprovalSheet.tsx | 바텀시트 UI (pending/signing/success/error) | ✅ OK |
| PendingIndicator.tsx | floating badge (design.md app 모듈 구조) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 상태 머신 (idle→pending→signing→success/error) | ✅ TxApprovalContext.tsx | OK |
| SignedApprovalBuilder 연동 | ✅ TxApprovalContext.tsx | OK |
| RelayClient 연동 | ✅ TxApprovalContext.tsx | OK |
| 바텀시트 UI (4가지 상태별 content) | ✅ TxApprovalSheet.tsx | OK |
| approve/reject/retry/skip 액션 | ✅ 양쪽 파일 | OK |
| PendingIndicator badge | ✅ PendingIndicator.tsx | OK |

### 검증 통과: ✅

---

→ 다음: [Step 39: app - Chat 탭](step-39-chat-tab.md)
