# Step 04: Tool Calls 실시간 표시

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (daemon + app 파일 revert)
- **선행 조건**: Step 03 (Daemon 이벤트 계약 변경 완료)

---

## 1. 구현 내용 (design.md 기반)

### Daemon 변경
- **tool-call-loop.ts**: ProcessChatOptions에 onToolStart/onToolDone 콜백 추가
  - tool 실행 전 `opts.onToolStart?.(fnName, toolCall.id)` 호출
  - tool 실행 성공 후 `opts.onToolDone?.(fnName, toolCall.id, true)` 호출
  - tool 실행 실패 시 `opts.onToolDone?.(fnName, toolCall.id, false)` 호출
- **chat-handler.ts**: _processChatDirect에서 processChat 호출 시 onToolStart/onToolDone 콜백 구현
  - onToolStart → relay.send('chat', { type: 'tool_start', toolName, toolCallId, sessionId, userId })
  - onToolDone → relay.send('chat', { type: 'tool_done', toolName, toolCallId, status, sessionId, userId })

### App 변경
- **ChatDetailScreen.tsx**: relay 핸들러에 tool_start/tool_done case 추가
  - tool_start → ToolChatMessage(kind='tool', toolStatus='running') 생성
  - tool_done → 동일 id의 ToolChatMessage toolStatus를 'done' 또는 'error'로 업데이트
- **메시지 렌더링**: tool 메시지를 작은 인디케이터로 표시
  - running: "실행 중..."
  - done: "완료"
  - error: "실패"

## 2. 완료 조건
- [ ] ProcessChatOptions 타입에 onToolStart/onToolDone 필드 존재
- [ ] tool-call-loop.ts에서 executeToolCall 전후에 콜백 호출 존재
- [ ] chat-handler.ts에서 onToolStart → relay.send('chat', { type: 'tool_start', ... }) 구현
- [ ] chat-handler.ts에서 onToolDone → relay.send('chat', { type: 'tool_done', ..., status }) 구현
- [ ] ChatDetailScreen에 tool_start 핸들러 → ToolChatMessage(toolStatus='running') 생성
- [ ] ChatDetailScreen에 tool_done 핸들러 → ToolChatMessage toolStatus 업데이트
- [ ] tool 메시지가 UI에 인디케이터로 렌더링됨 (running/done/error 구분)
- [ ] 여러 tool 연속 호출 시 각각 별도 표시
- [ ] `cd packages/app && npx tsc --noEmit` 통과

## 3. 롤백 방법
- daemon: tool-call-loop.ts, chat-handler.ts의 tool 콜백 부분 revert
- app: ChatDetailScreen.tsx의 tool 핸들러 부분 revert

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/tool-call-loop.ts  # 수정 — ProcessChatOptions에 onToolStart/onToolDone 추가 + 콜백 호출
└── src/chat-handler.ts    # 수정 — processChat 호출 시 onToolStart/onToolDone 콜백 구현

packages/app/
└── src/domains/chat/screens/ChatDetailScreen.tsx  # 수정 — tool_start/tool_done 핸들러 + 렌더링
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| useChatStore.ts | 직접 사용 | addMessage로 ToolChatMessage 저장 (Step 01에서 타입 정의) |
| relay ws.ts | 간접 | relay는 chat 메시지를 pass-through하므로 수정 불필요 |

### Side Effect 위험
- processChat의 기존 onDelta 콜백과 onToolStart/onToolDone이 동시에 호출될 수 있음 → 독립적이므로 충돌 없음

### 참고할 기존 패턴
- chat-handler.ts의 기존 onDelta 콜백 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-call-loop.ts | ProcessChatOptions + 콜백 호출 | ✅ OK |
| chat-handler.ts | 콜백 → relay.send 구현 | ✅ OK |
| ChatDetailScreen.tsx | tool 핸들러 + 렌더링 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ProcessChatOptions 타입 확장 | ✅ tool-call-loop.ts | OK |
| 콜백 호출 삽입 | ✅ tool-call-loop.ts | OK |
| relay.send 구현 | ✅ chat-handler.ts | OK |
| App 핸들러 + 렌더링 | ✅ ChatDetailScreen.tsx | OK |

### 검증 통과: ✅
