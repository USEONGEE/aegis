# Step 07: pending message 취소 (Change 4)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 06

---

## 1. 구현 내용 (design.md 기반)
- daemon: enqueue 시 `message_queued` control message 전송 (messageId 포함)
- daemon control-handler: `cancel_message` 메시지 처리 → `cancel_message_result` 반환
- SessionMessageQueue.cancel(): CancelResult 반환 ({ ok, reason?, wasProcessing? })
- 처리 중 취소: AbortController.abort() → processChat signal.aborted 체크
- tool-call-loop.ts: signal 파라미터 추가, aborted 체크
- app RelayClient: message_queued 수신 처리, cancelMessage() 메서드 추가

## 2. 완료 조건
- [ ] message-queue.test.ts: pending 취소 테스트 통과
- [ ] message-queue.test.ts: 처리 중 취소 abort 테스트 통과
- [ ] message-queue.test.ts: already_completed / not_found 테스트 통과
- [ ] `grep -A3 'interface CancelResult' packages/daemon/src/message-queue.ts` 에 ok, reason, wasProcessing 필드
- [ ] `grep -rn 'message_queued' packages/app/src/` 결과 1건 이상
- [ ] `grep -rn 'cancel_message\|cancelMessage' packages/app/src/core/relay/RelayClient.ts` 결과 1건 이상
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon + app RelayClient

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── message-queue.ts            # cancel() → CancelResult, message_queued 전송
├── control-handler.ts          # cancel_message 처리 추가
├── tool-call-loop.ts           # signal 파라미터, aborted 체크
└── index.ts                    # processor에 signal 전달

packages/app/src/
└── core/relay/RelayClient.ts   # message_queued 수신, cancelMessage() 메서드

packages/daemon/tests/
└── message-queue.test.ts       # cancel 관련 테스트 추가
```

## FP/FN 검증

### 검증 통과: ✅

---

> 다음: [Step 08: signTransaction](step-08-sign-transaction.md)
