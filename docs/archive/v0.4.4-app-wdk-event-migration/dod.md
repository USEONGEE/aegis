# DoD (Definition of Done) - v0.4.4

## 기능 완료 조건

### F1. sendApproval() WDK 이벤트 전환
- [ ] sendApproval()이 event_stream의 WDK 이벤트로 성공/실패를 판정 (ControlResult 아님)
- [ ] 6종 승인 타입별 성공 이벤트로 resolve: tx→ExecutionBroadcasted(hash포함), policy→PolicyApplied, reject→ApprovalRejected, revoke→SignerRevoked, wallet_create→WalletCreated, wallet_delete→WalletDeleted
- [ ] ApprovalFailed 수신 시 reject
- [ ] requestId 매칭으로 자기 요청만 처리
- [ ] 반환값 `{ txHash }` 유지 (non-tx 승인은 빈 문자열)
- 검증: tsc + 수동 승인 테스트

### F2. eventName → event.type 마이그레이션
- [ ] DashboardScreen에서 `data.eventName` → `data.event.type` 사용
- [ ] SettingsScreen에서 `data.eventName` → `data.event.type` 사용
- [ ] app/src 전체에서 `eventName` 문자열 참조 없음
- 검증: `grep -r "eventName" packages/app/src/` 결과 0건

### F3. Activity Store 이벤트 적재
- [ ] RootNavigator syncHandler에서 event_stream 수신 → useActivityStore.addEvent()
- [ ] ActivityEventType에 'ApprovalFailed' 포함
- [ ] 적재만 (화면 표시는 후속 Phase)
- 검증: tsc

## 비기능 완료 조건

### NF1. 타입 안전
- [ ] `tsc --noEmit` 통과 (app 패키지)
