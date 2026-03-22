# Step 01: control 단방향화 + event_stream 분리

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md Phase A + B)

1. `protocol/src/events.ts`에 CancelCompletedEvent, CancelFailedEvent, DaemonEvent 추가
2. `protocol/src/events.ts`에 MessageQueuedEvent, MessageStartedEvent, CronSessionCreatedEvent를 control.ts에서 이동 (daemon→app 알림이므로 event_stream 소속)
3. `protocol/src/events.ts`에 AnyStreamEvent = AnyWDKEvent | DaemonEvent | MessageQueuedEvent | MessageStartedEvent | CronSessionCreatedEvent 정의
4. `protocol/src/events.ts`에 EventStreamPayload 독립 정의
5. `protocol/src/control.ts`에서 ControlEvent 제거 (모든 variant가 event_stream으로 이동)
6. `protocol/src/control.ts`에서 ControlResult 삭제
7. `protocol/src/index.ts` export 정리: +DaemonEvent, +AnyStreamEvent, +EventStreamPayload, -ControlResult, -ControlEvent
8. `daemon/src/control-handler.ts`에서 cancel 반환을 CancelEventPayload로 변경
9. `daemon/src/index.ts`에서 cancel 결과 + message_queued/message_started/cron_session_created를 모두 event_stream으로 전송
10. `daemon/tests/control-handler.test.ts` assertion 수정
11. `app/src/domains/chat/screens/ChatDetailScreen.tsx`에서 cancel 수신을 event_stream에서 CancelCompleted/CancelFailed로 변경

## 2. 완료 조건
- [ ] CancelCompletedEvent, CancelFailedEvent, DaemonEvent union이 events.ts에 정의됨
- [ ] MessageQueuedEvent, MessageStartedEvent, CronSessionCreatedEvent가 events.ts로 이동됨
- [ ] AnyStreamEvent가 모든 daemon→app 이벤트를 포함
- [ ] EventStreamPayload가 events.ts에 독립 정의됨
- [ ] ControlEvent가 protocol에서 완전히 제거됨 (모든 variant가 event_stream으로)
- [ ] ControlResult가 protocol에서 완전히 제거됨
- [ ] control-handler cancel이 CancelEventPayload 반환
- [ ] index.ts가 cancel 결과 + 알림 이벤트를 event_stream으로 전송
- [ ] `npm test --workspace=packages/daemon` 통과
- [ ] `npx tsc --noEmit -p packages/protocol` 통과

## 3. 롤백 방법
- git revert — protocol/daemon/app 모든 변경을 한 커밋으로 묶으면 단일 revert 가능

---

## Scope

### 수정 대상 파일
```
packages/protocol/src/
├── events.ts      # 수정 — +Cancel이벤트, +DaemonEvent, +MQ/MS/CSC 이동, +AnyStreamEvent, +EventStreamPayload
├── control.ts     # 수정 — -ControlEvent 전체 제거, -ControlResult 전체 삭제
└── index.ts       # 수정 — export 정리

packages/daemon/src/
├── control-handler.ts  # 수정 — cancel 반환 타입 변경
└── index.ts            # 수정 — 모든 daemon→app 이벤트를 event_stream으로 전송

packages/daemon/tests/
└── control-handler.test.ts  # 수정 — ControlResult → CancelEventPayload assertion

packages/app/src/domains/chat/screens/
└── ChatDetailScreen.tsx  # 수정 — cancel 수신을 event_stream에서
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| events.ts | Cancel 이벤트 + MQ/MS/CSC 이동 + AnyStreamEvent | ✅ OK |
| control.ts | ControlEvent/ControlResult 제거 | ✅ OK |
| index.ts | export 정리 | ✅ OK |
| control-handler.ts | cancel 반환 변경 | ✅ OK |
| daemon/index.ts | event_stream 전송 전환 | ✅ OK |
| control-handler.test.ts | assertion 수정 | ✅ OK |
| ChatDetailScreen.tsx | cancel 수신 전환 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ControlEvent import 제거 (daemon/app 전체) | tsc가 컴파일 에러로 발견 | ✅ OK — tsc로 커버 |

### 검증 통과: ✅

→ 다음: [Step 02: relay 이중 전달 제거 + event_stream 변환](step-02-relay-cleanup.md)
