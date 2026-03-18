# Step 22: daemon - chat_queue handler

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 19 (tool-call-loop), Step 20 (relay-client)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/chat-handler.js` 생성. Relay의 chat_queue를 통해 수신되는 사용자 메시지를 OpenClaw에 전달하고, 응답을 다시 Relay로 전송하는 핸들러를 구현한다. chat_queue는 session 스코프로 전달된다 (DoD F40).

**처리 흐름 (design.md Flow 1, ①~⑦)**:

```
① Relay chat_queue에서 사용자 메시지 수신 (channel: 'chat', sessionId)
② E2E 복호화 → 평문 메시지 추출
③ processChat(userId, sessionId, userMessage) 호출 (tool-call-loop)
④ tool-call-loop가 OpenClaw ↔ WDK 루프 실행
⑤ 최종 assistant 응답 수신
⑥ E2E 암호화 → Relay chat_queue로 응답 전송
⑦ RN App이 Relay에서 응답 수신
```

- `createChatHandler(processChat, relayClient)`: 핸들러 생성
- `handle(message)`: chat_queue 메시지 처리
  - `message.sessionId`로 세션 식별
  - `message.payload` 복호화 → 사용자 메시지 추출
  - processChat 호출 → 응답 수신
  - 응답 암호화 → relayClient.send('chat', encryptedResponse, sessionId)
- **동시 세션 처리**: 여러 sessionId의 메시지가 병렬로 도착할 수 있음. 세션별 독립 처리 (Promise 기반)
- **에러 처리**: processChat 실패 시 에러 메시지를 사용자에게 전달 (`{ type: 'error', message }`)

## 2. 완료 조건
- [ ] `packages/daemon/src/chat-handler.js` 에서 `createChatHandler` export
- [ ] `handle(message)` 가 chat_queue 메시지를 processChat에 전달
- [ ] sessionId 기반으로 세션 식별
- [ ] processChat 응답을 relayClient.send('chat', response, sessionId)로 전송
- [ ] 여러 sessionId 메시지가 병렬 처리됨 (서로 블로킹하지 않음)
- [ ] processChat 에러 시 에러 메시지를 사용자에게 전달
- [ ] relay-client의 onMessage에 chat_handler.handle 연결 (channel === 'chat')
- [ ] `npm test -- packages/daemon` 통과 (chat-handler 단위 테스트, mock processChat/relay)

## 3. 롤백 방법
- `packages/daemon/src/chat-handler.js` 삭제
- relay-client onMessage에서 chat handler 연결 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  chat-handler.js         # chat_queue 메시지 처리
packages/daemon/tests/
  chat-handler.test.js    # 단위 테스트 (mock processChat/relay)
```

### 수정 대상 파일
```
packages/daemon/src/index.js    # relay onMessage에 chat handler 연결
```

### Side Effect 위험
- processChat 호출 → OpenClaw API + WDK 상태 변경. 테스트에서는 mock 사용

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| chat-handler.js | chat_queue 메시지 처리 | ✅ OK |
| chat-handler.test.js | 단위 테스트 | ✅ OK |
| index.js 수정 | 핸들러 연결 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| handle(message) → processChat | ✅ chat-handler.js | OK |
| sessionId 기반 세션 식별 | ✅ chat-handler.js | OK |
| 응답 전송 (relayClient.send) | ✅ chat-handler.js | OK |
| 병렬 세션 처리 | ✅ chat-handler.js | OK |
| 에러 처리 → 사용자 에러 전달 | ✅ chat-handler.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 23: daemon - Execution Journal](step-23-execution-journal.md)
