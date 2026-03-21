# Step 03: 수신 흐름 UX + Cron 표시 + 오프라인 복구

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (daemon + app + relay 파일 revert)
- **선행 조건**: Step 02 (세션 UI 완료 — ChatDetailScreen 존재)

---

## 1. 구현 내용 (design.md 기반)

### Daemon 변경
- **chat-handler.ts**: _processChatDirect에 `source: 'user' | 'cron'` 파라미터 추가
  - source !== 'cron'일 때만 typing 전송
  - done/stream/error/cancelled relay 메시지에 source 포함
  - handleChatMessage 직접 호출 시 source='user' 전달
- **index.ts**: queue processor에서 msg.source를 _processChatDirect에 전달
  - cron 실행 시 control에 `{ type: 'cron_session_created', sessionId, cronId, userId }` 이벤트 전송

### App 변경
- **ChatDetailScreen.tsx**:
  - cancelled case 추가 → StatusChatMessage(kind='status', status='cancelled') 생성
  - message_queued case → queuedMessageId 설정 + user bubble에 "전송됨 ✓" 파생 표시
  - 세션 필터 완화: 현재 세션이 아닌 메시지도 store에 저장 (UI 업데이트는 현재 세션만)
  - source 필드 저장: data.source를 ChatMessage.source로 전달
- **useChatStore.ts**: queuedMessageId: string | null 필드 + setQueuedMessageId 액션 (Step 01에서 이미 정의됨, 여기서 활용)

### Relay 변경
- **ws.ts**: startStreamPolling에 chatCursors 파라미터 추가
  - authenticate payload에서 chatCursors 파싱
  - chatCursors의 각 세션에 대해 pollStream 호출
- **pollStream 인라인 주석**: XREAD의 stale cursor 안전성에 대한 주석 추가 (E5 DoD)

### App RelayClient 변경
- authenticate payload에 chatCursors(streamCursors) 포함
- 메시지 수신 시 streamCursors/controlCursor 업데이트

## 2. 완료 조건
- [ ] _processChatDirect 시그니처에 `source: 'user' | 'cron'` 존재
- [ ] index.ts queue processor에서 msg.source 전달
- [ ] done/stream/error/cancelled relay 메시지에 source 포함
- [ ] source === 'cron'이면 typing 미전송
- [ ] cron 실행 시 control에 cron_session_created 이벤트 전송
- [ ] ChatDetailScreen에 cancelled 핸들러 → StatusChatMessage 생성
- [ ] message_queued 수신 시 user bubble에 "전송됨 ✓" 표시
- [ ] 현재 세션이 아닌 메시지도 store에 저장
- [ ] relay authenticate에 chatCursors 포함
- [ ] relay startStreamPolling에서 chatCursors 기반 chat stream polling
- [ ] pollStream에 stale cursor 안전성 인라인 주석 존재
- [ ] 앱 종료 중 cron → 재시작 → 세션 목록에 cron 세션 + AI 응답 표시
- [ ] `cd packages/app && npx tsc --noEmit` 통과

## 3. 롤백 방법
- daemon: chat-handler.ts, index.ts revert
- app: ChatDetailScreen.tsx, RelayClient.ts revert
- relay: ws.ts revert

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/chat-handler.ts    # 수정 — source 파라미터, relay 메시지 source 포함, cron typing 스킵
└── src/index.ts           # 수정 — queue processor source 전달, cron_session_created 이벤트

packages/app/
├── src/domains/chat/screens/ChatDetailScreen.tsx  # 수정 — cancelled/queued 핸들러, 세션 필터 완화, source 저장
└── src/core/relay/RelayClient.ts                  # 수정 — authenticate chatCursors, cursor 업데이트

packages/relay/
└── src/routes/ws.ts       # 수정 — startStreamPolling chatCursors 추가, stale cursor 주석
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| message-queue.ts (daemon) | 읽기 전용 | QueuedMessage.source 참조만 — 수정 불필요 |
| cron-scheduler.ts (daemon) | 읽기 전용 | cron dispatch가 이미 source:'cron'으로 enqueue — 수정 불필요 |
| useChatStore.ts (app) | 직접 사용 | addMessage, queuedMessageId 활용 (Step 01에서 구현) |

### Side Effect 위험
- relay ws.ts 변경이 기존 control polling에 영향 줄 수 있음 → chatCursors 추가만이므로 기존 동작에 영향 없음
- daemon 시그니처 변경 → handleChatMessage에서 직접 호출부 + queue processor 호출부 모두 업데이트 필요

### 참고할 기존 패턴
- relay ws.ts의 기존 startStreamPolling/pollStream 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| chat-handler.ts | source 파라미터 + relay 메시지 | ✅ OK |
| index.ts | queue processor + cron_session_created | ✅ OK |
| ChatDetailScreen.tsx | cancelled/queued/source 핸들러 | ✅ OK |
| RelayClient.ts | chatCursors authenticate + cursor 업데이트 | ✅ OK |
| ws.ts | startStreamPolling 확장 + stale cursor 주석 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| source 파라미터 전파 | ✅ chat-handler + index.ts | OK |
| cron_session_created | ✅ index.ts | OK |
| cancelled 핸들러 | ✅ ChatDetailScreen.tsx | OK |
| chatCursors authenticate | ✅ RelayClient.ts + ws.ts | OK |
| stale cursor 주석 | ✅ ws.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: Tool calls 실시간 표시](step-04-tool-calls.md)
