# DoD (Definition of Done) - v0.3.1

## 설계 결정 보충 (Step 2 Codex 피드백 반영)

**queued 표시 방식**: `queued`는 별도 StatusChatMessage가 아닌, user bubble의 파생 UI 상태.
- Store에 `queuedMessageId: string | null` (transient, 비영속)
- 렌더링 시 해당 user 메시지 하단에 "전송됨 ✓" 표시
- `cancelled`만 별도 StatusChatMessage로 영속화

따라서 StatusChatMessage의 status는 `'cancelled'`만 남는다.

---

## 기능 완료 조건

### 항목 5: 대화 이력 영속성

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | useChatStore가 `sessions: Record<string, ChatMessage[]>` 구조를 사용 | 코드 검사: useChatStore.ts에서 `sessions: Record<string, ChatMessage[]>` 타입 선언 존재 |
| F2 | zustand persist 미들웨어 + AsyncStorage 적용 | 코드 검사: `persist<ChatState>` + `createJSONStorage(() => AsyncStorage)` 존재 |
| F3 | 앱 재시작 후 이전 세션의 모든 메시지가 유지됨 | 수동: 메시지 전송 → 앱 종료 → 재시작 → 이전 메시지 표시 확인 |
| F4 | isLoading/isTyping은 영속화되지 않음 (앱 재시작 시 false) | 코드 검사: partialize에서 isLoading/isTyping 제외 |
| F5 | currentSessionId가 영속화되어 앱 재시작 시 마지막 세션으로 복원 | 수동: 세션 A에서 대화 → 앱 종료 → 재시작 → 세션 A의 ChatDetailScreen으로 진입 |
| F6 | ChatMessage가 discriminated union(TextChatMessage \| ToolChatMessage \| StatusChatMessage) | 코드 검사: `type ChatMessage = TextChatMessage \| ToolChatMessage \| StatusChatMessage` 선언 + 각 variant에 `kind` discriminant 존재 |
| F7 | @react-native-async-storage/async-storage 의존성 추가 | `cat packages/app/package.json` — 의존성 존재 확인 |

### 항목 1: 세션별 대화창

| # | 조건 | 검증 방법 |
|---|------|----------|
| F8 | Chat 탭이 Stack Navigator(ChatListScreen + ChatDetailScreen) 구조 | 코드 검사: RootNavigator에서 `ChatStack.Navigator` 사용 |
| F9 | ChatListScreen에서 "새 대화" 버튼으로 새 세션 생성 후 ChatDetailScreen 진입 | 수동: "새 대화" 탭 → 대화 화면 전환 확인 |
| F10 | ChatListScreen에서 기존 세션 카드 탭 → 해당 세션의 메시지 로드 | 수동: 세션 카드 탭 → 해당 세션 메시지 표시 확인 |
| F11 | sessionList가 lastMessageAt 역순 정렬 | 코드 검사: FlatList data의 sort 로직 확인 |
| F12 | cron 세션에 "자동 실행" 라벨 표시 | 수동: cron 세션 존재 시 라벨 표시 확인 |
| F13 | ChatDetailScreen 헤더에 세션 목록으로 돌아가는 뒤로가기 affordance | 수동: 대화 화면에서 뒤로가기 → 세션 목록 전환 확인 |
| F14 | @react-navigation/native-stack 의존성 추가 | `cat packages/app/package.json` — 의존성 존재 확인 |

### 항목 4: 메시지 수신 흐름 UX

| # | 조건 | 검증 방법 |
|---|------|----------|
| F15 | message_queued 수신 시 해당 user 메시지 하단에 "전송됨 ✓" 표시 | 수동: 메시지 전송 → queued 수신 → 해당 bubble에 표시 확인 |
| F16 | queuedMessageId가 transient (비영속) | 코드 검사: partialize에서 queuedMessageId 제외 |
| F17 | cancelled 수신 시 "요청이 취소되었습니다" StatusChatMessage 생성 | 수동: 취소 요청 → 시스템 메시지 표시 확인 |
| F18a | typing 수신 시 isTyping=true → "AI is typing..." 표시 | 수동: 메시지 전송 → typing indicator 표시 확인 |
| F18b | stream delta 수신 시 텍스트가 실시간 누적 표시 | 수동: AI 응답 중 글자가 순차 출력 확인 |
| F18c | done 수신 시 isTyping=false + isLoading=false + 최종 응답 표시 | 수동: AI 응답 완료 후 상태 초기화 + 전체 응답 표시 확인 |
| F18d | error 수신 시 에러 메시지 표시 | 수동: 에러 발생 시 에러 메시지 렌더링 확인 |

### 항목 3: Cron 메시지 표시

| # | 조건 | 검증 방법 |
|---|------|----------|
| F19 | daemon _processChatDirect에 source 파라미터 추가 | 코드 검사: 시그니처에 `source: 'user' \| 'cron'` 존재 |
| F20 | daemon index.ts queue processor에서 msg.source를 _processChatDirect에 전달 | 코드 검사: 호출부에 msg.source 인자 존재 |
| F21 | relay done/stream/error/cancelled 메시지에 source 필드 포함 | 코드 검사: relayClient.send 호출에 source 포함 |
| F22 | source === 'cron'이면 typing 이벤트 미전송 | 코드 검사: source 체크 조건문 존재 |
| F23 | cron 세션 메시지가 현재 세션이 아닌 경우에도 store에 저장됨 | 코드 검사: sessionId 필터가 UI 업데이트에만 적용, store 저장은 항상 수행 |
| F24 | addMessage가 미존재 세션을 자동 upsert | 코드 검사: sessions[sid] 미존재 시 세션 자동 생성 로직 확인 |

### 항목 2: Tool Calls 실시간 표시

| # | 조건 | 검증 방법 |
|---|------|----------|
| F25 | ProcessChatOptions에 onToolStart/onToolDone 콜백 추가 | 코드 검사: ProcessChatOptions 타입에 onToolStart/onToolDone 필드 존재 |
| F26 | tool-call-loop.ts에서 tool 실행 전 onToolStart, 실행 후 onToolDone 호출 | 코드 검사: executeToolCall 전후에 콜백 호출 존재 |
| F27 | chat-handler.ts에서 콜백을 relay.send('chat', { type: 'tool_start' / 'tool_done' })로 구현 | 코드 검사 |
| F28 | App에서 tool_start 수신 시 ToolChatMessage(kind='tool', toolStatus='running') 생성 | 수동: AI tool 호출 시 "실행 중..." 표시 확인 |
| F29 | App에서 tool_done 수신 시 동일 id의 ToolChatMessage toolStatus를 'done' 또는 'error'로 업데이트 | 수동: tool 완료 후 "완료" 또는 "실패"로 변경 확인 |

### 항목 6: 오프라인 Cron 응답 복구

| # | 조건 | 검증 방법 |
|---|------|----------|
| F30 | streamCursors(세션별)와 controlCursor가 영속화됨 | 코드 검사: partialize에 streamCursors/controlCursor 포함 |
| F31 | App RelayClient authenticate에 chatCursors 포함 | 코드 검사: authenticate payload에 chatCursors 필드 존재 |
| F32 | Relay startStreamPolling이 chatCursors의 각 세션 chat stream을 poll | 코드 검사: pollStream 호출이 chatCursors 기반으로 반복 |
| F33 | daemon이 cron 실행 시 control에 cron_session_created 이벤트 전송 | 코드 검사: 해당 relayClient.send 호출 존재 |
| F34 | 앱 종료 중 cron 실행 → 앱 재시작 → 세션 목록에 cron 세션 + AI 응답 표시 | 수동: 시나리오 D 검증 |

---

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | Daemon 변경의 타입 정합성은 개별 코드 검사 항목(F19~F27)으로 검증 | daemon-wide tsc 게이트 없음 — 기존 baseline 에러가 있어 전체 tsc가 유효하지 않음. 변경 범위의 타입 정합성은 F19~F27 개별 항목으로 커버 |
| N2 | TypeScript strict 모드 에러 0 (packages/app) | `cd packages/app && npx tsc --noEmit` |
| N3 | createSession의 source 인자가 필수 (optional 아님) | 코드 검사: `createSession: (source: 'user' \| 'cron') => string` — `?` 없음 확인 |
| N4 | MAX_SESSIONS(50) 초과 시 가장 오래된 세션 제거 | 코드 검사: sessionList.length 체크 + trim 로직 존재 |
| N5 | MAX_MESSAGES_PER_SESSION(500) 초과 시 오래된 메시지 trim | 코드 검사: messages.length 체크 + slice 로직 존재 |

---

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | chat 메시지가 cron_session_created보다 먼저 도착 | addMessage가 미존재 세션을 자동 upsert. 이후 cron_session_created는 idempotent | 코드 검사: addMessage 내 upsert 로직 |
| E2 | 앱 재시작 시 currentSessionId에 해당하는 세션이 MAX_SESSIONS trim으로 삭제된 상태 | ChatListScreen으로 진입 (currentSessionId를 null로 초기화) | 코드 검사: 복원 시 세션 존재 여부 체크 |
| E3 | stream 중 앱 백그라운드 전환 후 포그라운드 복귀 | relay reconnect → streamCursor 이후부터 이어받기 | 수동: stream 중 백그라운드 → 포그라운드 → 메시지 이어서 표시 |
| E4 | 동일 id의 메시지 중복 수신 (relay reconnect 경계) | addMessage에서 같은 id 덮어쓰기 (idempotent) | 코드 검사: findIndex + replace 로직 |
| E5 | Redis stream이 trim되어 cursor가 유효하지 않은 구간 참조 | Redis XREAD가 trim 이후부터 반환. 에러 없이 동작 | 코드 검사: relay pollStream 코드에 "XREAD는 trim된 ID 이후의 엔트리만 반환하므로 stale cursor는 안전" 취지의 인라인 주석 존재 |
| E6 | 세션이 0개인 상태에서 앱 시작 | ChatListScreen 표시. "새 대화" 버튼만 활성 | 수동: 초기 설치 후 세션 목록 확인 |

---

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. 대화 이력 영속성 | F1~F7 | ✅ |
| 2. 멀티 세션 UI | F8~F14 | ✅ |
| 3. 메시지 수신 흐름 완성 | F15~F18 | ✅ |
| 4. Cron 메시지 전파 | F19~F24 | ✅ |
| 5. Tool call 실시간 표시 | F25~F29 | ✅ |
| 6. 오프라인 cron 응답 복구 | F30~F34 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| Record\<sessionId, messages[]\> 구조 | F1 | ✅ |
| zustand persist + AsyncStorage | F2, F7 | ✅ |
| currentSessionId 영속화 | F5 | ✅ |
| Stack Navigator in Tab | F8, F14 | ✅ |
| discriminated union ChatMessage | F6 | ✅ |
| source 파라미터 전파 | F19~F22 | ✅ |
| onToolStart/onToolDone 콜백 | F25~F27 | ✅ |
| relay chatCursors polling | F31, F32 | ✅ |
| addMessage 자동 upsert | F24, E1 | ✅ |
| queued = 파생 UI 상태 | F15, F16 | ✅ |
| No Optional (createSession source 필수) | N3 | ✅ |
