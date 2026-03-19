# Step 19: daemon - tool-call 실행 루프

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 17 (tool-surface), Step 18 (openclaw-client)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/tool-call-loop.js` 생성. OpenClaw chat 응답의 tool_call을 WDK로 실행하고 결과를 다시 OpenClaw에 반환하는 메인 루프를 구현한다.

**실행 흐름 (design.md Flow 1~3)**:

```
① 사용자 메시지 수신 (chat_queue 또는 cron)
② openclawClient.chat(userId, sessionId, messages)
③ 응답에 tool_calls가 있으면:
   ├─ 각 tool_call에 대해 executeToolCall(toolCall) 실행
   ├─ tool result를 messages에 추가 (role: 'tool')
   └─ 다시 ②로 (tool_calls가 없을 때까지 반복)
④ 최종 assistant 응답 반환
```

- `processChat(userId, sessionId, userMessage)`: 메인 루프 함수
  - messages 배열 구성: `[{ role: 'user', content: userMessage }]`
  - 루프: chat() → tool_calls 존재 시 executeToolCall → tool result → 재호출
  - 루프 안전장치: 최대 10회 반복 (무한 루프 방지)
  - 최종 응답: `response.choices[0].message.content`
- **REQUIRE_APPROVAL 중단점**: sendTransaction/transfer가 `pending_approval` 반환 시, tool result를 OpenClaw에 전달하여 사용자에게 대기 상태 알림. 승인 수신 후 후속 처리는 control-handler(Step 21)가 트리거
- **에러 처리**: tool 실행 에러 시 `{ status: 'error', error: message }` 를 tool result로 반환 (루프 중단하지 않음)

## 2. 완료 조건
- [ ] `packages/daemon/src/tool-call-loop.js` 에서 `processChat` export
- [ ] `processChat(userId, sessionId, userMessage)` 가 OpenClaw chat → tool_call → WDK → tool result → OpenClaw 루프를 실행
- [ ] tool_calls가 없을 때까지 반복 후 최종 assistant 응답 반환
- [ ] 루프 최대 10회 반복 제한 (초과 시 에러)
- [ ] tool 실행 에러 시 `{ status: 'error', error }` tool result 반환 (루프 계속)
- [ ] REQUIRE_APPROVAL 시 `pending_approval` tool result → OpenClaw에 대기 상태 전달
- [ ] messages 배열에 role='tool' 메시지가 올바르게 추가됨 (tool_call_id 포함)
- [ ] `npm test -- packages/daemon` 통과 (tool-call-loop 단위 테스트, mock openclaw-client + tool-surface)

## 3. 롤백 방법
- `packages/daemon/src/tool-call-loop.js` 삭제
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  tool-call-loop.js       # OpenClaw ↔ WDK tool-call 실행 루프
packages/daemon/tests/
  tool-call-loop.test.js  # 단위 테스트 (mock openclaw + tool-surface)
```

### 수정 대상 파일
```
없음 (chat-handler에서 import — Step 22에서 연결)
```

### Side Effect 위험
- OpenClaw API 호출 + WDK 상태 변경 (sendTransaction 등). 테스트에서는 mock 사용

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-call-loop.js | 메인 실행 루프 | ✅ OK |
| tool-call-loop.test.js | 단위 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| processChat (메인 루프) | ✅ tool-call-loop.js | OK |
| tool_call → executeToolCall → tool result 반복 | ✅ tool-call-loop.js | OK |
| 최대 반복 제한 (10회) | ✅ tool-call-loop.js | OK |
| 에러 → tool result 변환 | ✅ tool-call-loop.js | OK |
| REQUIRE_APPROVAL 중단점 | ✅ tool-call-loop.js | OK |
| messages 배열 관리 (tool_call_id) | ✅ tool-call-loop.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 20: daemon - Relay WebSocket client](step-20-relay-client.md)
