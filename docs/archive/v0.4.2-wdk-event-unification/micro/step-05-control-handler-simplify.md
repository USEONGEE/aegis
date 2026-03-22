# Step 05: Control-Handler 단순화

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 04

---

## 1. 구현 내용 (design.md 기반)
- 승인 6종 브랜치에서 store 직접 접근 코드 제거 (savePolicy, listSigners, setTrustedApprovers)
- 승인 6종 브랜치를 `broker.submitApproval(signedApproval, context)` 한 줄로 단순화
- 승인 6종: `handleControlMessage` 반환값을 null로 변경 (relay forward 제거 준비)
- cancel_queued/cancel_active: 기존 ControlResult 반환 유지
- `handleControlMessage` 반환 타입을 `Promise<ControlResult | null>`로 변경

## 2. 완료 조건
- [ ] control-handler.ts에 `approvalStore.savePolicy` 호출 없음
- [ ] control-handler.ts에 `approvalStore.listSigners` 호출 없음
- [ ] control-handler.ts에 `broker.setTrustedApprovers` 호출 없음
- [ ] 승인 6종 브랜치가 각각 `broker.submitApproval(signedApproval, context)` + `return null`
- [ ] cancel 2종은 기존 ControlResult 반환 유지
- [ ] `handleControlMessage` 반환 타입이 `Promise<ControlResult | null>`
- [ ] `tsc --noEmit` 통과 (daemon)

## 3. 롤백 방법
- git revert (control-handler.ts 변경만)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── control-handler.ts  # 수정 — store 직접 접근 제거, 반환 타입 변경
└── index.ts            # 수정 — handleControlMessage 반환값 null 체크 추가 (forward skip)
```

### 수정 포인트 (control-handler.ts)
- Line 96-128: policy_approval → savePolicy 제거, ApprovalSubmitContext 전달, return null
- Line 155-186: device_revoke → listSigners/setTrustedApprovers 제거, return null
- Line 78-91: tx_approval → return null
- Line 138-149: policy_reject → return null
- Line 192-203: wallet_create → return null
- Line 209-220: wallet_delete → return null
- Line 303-314: cancel_queued → return ControlResult (유지)
- Line 320-331: cancel_active → return ControlResult (유지)

### 수정 포인트 (index.ts)
- Line 97-101: `handleControlMessage().then((result) => { relayClient.send(...) })` → null 체크 추가

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 06: Protocol + RELAY_EVENTS 업데이트](step-06-protocol-relay-events.md)
