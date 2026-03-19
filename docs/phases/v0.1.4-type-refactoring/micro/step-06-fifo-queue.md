# Step 06: daemon FIFO queue (Change 2)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 05

---

## 1. 구현 내용 (design.md 기반)
- `packages/daemon/src/message-queue.ts` 신규 생성:
  - `QueuedMessage`, `PendingMessageRequest`, `CancelResult`, `MessageProcessor` 타입
  - `SessionMessageQueue` 클래스: enqueue, cancel, listPending, dispose
  - `MessageQueueManager` 클래스: getQueue, enqueue, cancel, dispose
  - maxQueueSize(기본 100), processTimeout(기본 120s)
- chat-handler.ts: 직접 processChat() → queueManager.enqueue()
- cron-scheduler.ts: 직접 processChat() → queueManager.enqueue()
- index.ts: MessageQueueManager 생성 + processor 콜백 등록

## 2. 완료 조건
- [ ] `grep -n 'class SessionMessageQueue' packages/daemon/src/message-queue.ts` 결과 1건
- [ ] `grep -A5 'interface PendingMessageRequest' packages/daemon/src/message-queue.ts` 에 messageId, sessionId, source, text, createdAt 필드
- [ ] 금지: `grep -rn 'processChat(' packages/daemon/src/chat-handler.ts packages/daemon/src/cron-scheduler.ts` 결과 0건
- [ ] 의도: `grep -rn 'queueManager\|enqueue' packages/daemon/src/chat-handler.ts packages/daemon/src/cron-scheduler.ts` 결과 1건 이상
- [ ] message-queue.test.ts: 동시 enqueue 순서 보장 테스트 통과
- [ ] message-queue.test.ts: queue full 테스트 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert + message-queue.ts 삭제
- 영향: daemon 패키지

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── message-queue.ts            # 신규 - SessionMessageQueue, MessageQueueManager
├── chat-handler.ts             # processChat → queueManager.enqueue
├── cron-scheduler.ts           # processChat → queueManager.enqueue
└── index.ts                    # MessageQueueManager 초기화, processor 등록

packages/daemon/tests/
└── message-queue.test.ts       # 신규 - 순서 보장, queue full, cancel 테스트
```

### 신규 생성 파일
```
packages/daemon/src/message-queue.ts
packages/daemon/tests/message-queue.test.ts
```

### Side Effect 위험
- 기존 fire-and-forget 패턴이 queue 기반으로 변경 → 기존 테스트에서 chat-handler mock 방식 변경 필요

## FP/FN 검증

### 검증 통과: ✅

---

> 다음: [Step 07: pending 취소](step-07-pending-cancel.md)
