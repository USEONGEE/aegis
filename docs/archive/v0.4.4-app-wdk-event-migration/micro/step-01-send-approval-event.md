# Step 01: sendApproval() WDK 이벤트 전환

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

## 1. 구현 내용
- RelayClient.sendApproval()의 응답 대기를 ControlResult(approval_result/approval_error) → event_stream WDK 이벤트로 변경
- approval type별 성공 이벤트 매핑:
  - tx → ExecutionBroadcasted (hash 포함)
  - policy → PolicyApplied
  - policy_reject → ApprovalRejected
  - device_revoke → SignerRevoked
  - wallet_create → WalletCreated
  - wallet_delete → WalletDeleted
- ApprovalFailed 수신 시 reject
- requestId 매칭으로 자기 요청만 처리
- 반환값 `{ txHash }` 유지 (tx: ExecutionBroadcasted.hash, non-tx: 빈 문자열)

## 2. 완료 조건
- [ ] sendApproval()이 event_stream 기반으로 resolve/reject
- [ ] 6종 매핑이 올바르게 구현
- [ ] ApprovalFailed → reject
- [ ] requestId 매칭
- [ ] 반환값 { txHash } 유지
- [ ] tsc 통과
- [ ] 수동 승인 테스트: 앱에서 승인 → 타임아웃 없이 성공/실패 확인

## 3. 롤백 방법
- git revert (RelayClient.ts 변경만)

## Scope

### 수정 대상 파일
```
packages/app/src/core/relay/
└── RelayClient.ts  # 수정 — sendApproval() 응답 핸들러
```

## FP/FN 검증
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음: AppProviders/TxApprovalContext는 반환값 유지이므로 변경 불필요

→ 다음: [Step 02](step-02-eventname-migration.md)
