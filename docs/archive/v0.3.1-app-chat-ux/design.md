# 설계 - v0.3.1

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 패키지(daemon+app+relay) 수정, 새 화면/파일 추가, daemon↔app 이벤트 계약 변경, 새 의존성 추가, store 구조 전면 재설계
**서비스 경계 미승격 사유**: daemon/app/relay 모두 동일 팀(1인) 소유. 외부 팀 계약이나 독립 배포 주기가 없으므로 "서비스 경계"로 올리지 않음

---

## 문제 요약
Daemon 채팅 인프라는 완성되어 있으나 App 측 UX가 5개 영역(대화 영속성, 멀티세션, 수신흐름, cron 표시, tool call 표시)에서 미완성. 추가로 오프라인 cron 응답 복구도 포함.

> 상세: [README.md](README.md) 참조

## 접근법

### 전체 전략
1. **Store 구조 전환**: 단일 배열 → 세션별 Record 구조 + zustand persist로 영속화
2. **네비게이션 확장**: Chat 탭에 Stack Navigator 도입 (세션 목록 + 세션 상세)
3. **Daemon 메시지 확장**: source 태그 전파 + tool 콜백 추가 (기존 wire contract에 필드 추가)
4. **Relay 최소 확장**: reconnect 시 chat stream polling으로 오프라인 메시지 복구

### 구현 순서 (의존관계 기반)
```
Step 1: 영속화 + Store 재구조화 (항목 5)
   └→ Step 2: 세션별 대화창 (항목 1)
       └→ Step 3: 수신 흐름 + Cron 표시 + 오프라인 복구 (항목 4+3+6)
           └→ Step 4: Tool calls 실시간 표시 (항목 2)
```

## 대안 검토

### Store 구조

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 단일 배열 + sessionId 필터 | 구조 변경 최소 | 세션 수 증가 시 매번 O(N) 필터. 영속화 시 단일 blob 비대. cron 메시지 분리 저장 곤란 | ❌ |
| B: Record\<sessionId, messages[]\> | 세션 접근 O(1). 영속화 시 partialize 용이. cron 세션 자연스러운 분리 | addMessage 로직 세션 키 기반으로 변경 | ✅ |

**선택 이유**: 세션별 대화창 + cron 세션 분리가 핵심 요구사항. Record 구조가 이를 자연스럽게 표현. "No Optional" 원칙 — 세션 키가 존재하면 배열은 항상 유효.

### 영속화

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: zustand persist + AsyncStorage | 공식 미들웨어. 설정 3줄. partialize 가능. RN 생태계 표준 | 대용량 시 JSON serialize 비용 | ✅ |
| B: expo-file-system | 대용량 유리. 파일 분할 가능 | zustand 미들웨어 없어 수동 sync 필요. 보일러플레이트 증가 | ❌ |

**선택 이유**: "Primitive First" — 가장 단순한 방식. MAX_SESSIONS(50) * MAX_MESSAGES_PER_SESSION(500) 제한으로 용량 관리 가능.

### 네비게이션

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Stack Navigator in Tab | 표준 RN 패턴. 뒤로가기 + 트랜지션 자동. 딥링크 확장 용이 | native-stack 의존성 추가 | ✅ |
| B: 조건부 렌더링 | 의존성 추가 없음 | 뒤로가기 미지원. 트랜지션 없음. 화면 히스토리 수동 관리 | ❌ |

**선택 이유**: 세션 목록과 대화 상세는 명백히 별개 화면. 기존 @react-navigation/native ^7.0.0과 호환.

### 오프라인 Cron 복구

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: relay startStreamPolling 확장 (chatCursors) | 기존 pollStream 함수 재사용. 새 로직 아닌 확장 | relay 코드 변경 포함 | ✅ |
| B: 새 REST API (GET /chat/history) | relay WS 코드 미변경 | 새 엔드포인트 + Redis XRANGE 구현 필요. 변경이 더 큼 | ❌ |
| C: daemon이 cron 결과를 control 채널로 중복 전송 | relay 변경 없음 | control 채널 오염. 메시지 중복. "No Fallback" 위반 | ❌ |

**선택 이유**: relay가 이미 Redis Streams + pollStream + lastStreamId 인프라를 갖추고 있음. chatCursors 파라미터 추가만으로 기존 인프라 활용 가능.

## 기술 결정

### Daemon 메시지 포맷 변경

| 결정 | 내용 |
|------|------|
| `_processChatDirect` 시그니처 | `source: 'user' \| 'cron'` 파라미터 추가 |
| relay 메시지 source 필드 | `done`, `stream`, `error`, `cancelled` 모두 `source` 포함 |
| cron typing 스킵 | `source === 'cron'`이면 typing 이벤트 미전송 |
| tool 이벤트 신규 | `{ type: 'tool_start', toolName, toolCallId }` / `{ type: 'tool_done', toolName, toolCallId, status }` |
| cron 세션 생성 알림 | daemon이 cron 실행 시 `{ type: 'cron_session_created', sessionId, cronId }` control 이벤트 전송 |

### App Store 구조

| 결정 | 내용 |
|------|------|
| 메시지 저장 | `sessions: Record<string, ChatMessage[]>` |
| 세션 메타 | `sessionList: ChatSession[]` (id, title, lastMessageAt, source, messageCount) |
| 영속화 | zustand persist + AsyncStorage. isLoading/isTyping 제외 |
| 메시지 제한 | MAX_SESSIONS=50, MAX_MESSAGES_PER_SESSION=500 |
| 커서 영속화 | `streamCursors: Record<string, string>` + `controlCursor: string` |
| 재시작 진입 | currentSessionId 영속화 → 마지막 세션 복원 |

### 네비게이션 구조

```
Chat 탭 (Stack Navigator)
  ├── ChatListScreen (세션 목록) — "새 대화" + 세션 카드
  └── ChatDetailScreen (대화 상세) — 기존 ChatScreen 리네임
      └── 헤더에 "← 목록" 뒤로가기 affordance (Codex Step 1 피드백 반영)
```

## 범위 / 비범위

**범위(In Scope)**:
- packages/app: store 재구조화, 세션 UI, 메시지 핸들러 확장, 영속화
- packages/daemon: source 전파, tool 콜백, cron_session_created 이벤트
- packages/relay: startStreamPolling에 chatCursors 추가 (최소 변경)

**비범위(Out of Scope)**:
- guarded-wdk 변경 없음
- manifest 변경 없음
- relay 인증 모델 변경 없음 (v0.3.0 범위)
- 세션 삭제/편집 UI
- 메시지 검색/페이지네이션

## 아키텍처 개요

### 데이터 흐름: Cron 메시지 전파

```
Daemon cron-scheduler
  │ dispatch(cronId, sessionId, userId, prompt)
  ▼
MessageQueue.enqueue({ source: 'cron', sessionId, ... })
  │
  ▼ queue processor
_processChatDirect(userId, sessionId, text, ..., source='cron')
  │
  ├─ [source !== 'cron'] relay.send('chat', { type: 'typing', ... })
  │
  ├─ processChat(..., { onDelta, onToolStart, onToolDone })
  │     ├─ onDelta → relay.send('chat', { type: 'stream', delta, source })
  │     ├─ onToolStart → relay.send('chat', { type: 'tool_start', toolName, toolCallId })
  │     └─ onToolDone → relay.send('chat', { type: 'tool_done', toolName, toolCallId, status })
  │
  └─ relay.send('chat', { type: 'done', content, source, toolResults })
       │
       ▼ Relay (Redis XADD to chat:{userId}:{sessionId})
       │
       ▼ App RelayClient (WebSocket)
       │
       ▼ ChatDetailScreen message handler
       │
       ▼ useChatStore.addMessage({ sessionId, source, ... })
```

### 데이터 흐름: 오프라인 Cron 복구

```
앱 종료 중:
  Daemon cron → Relay XADD to chat:{userId}:{sessionId}
  Daemon → Relay control: { type: 'cron_session_created', sessionId }

앱 재시작:
  zustand persist → sessions, sessionList, streamCursors, controlCursor 복원
  │
  RelayClient.connect()
  │ authenticate({ token, lastStreamId: controlCursor, chatCursors: { sid1: cursor1, ... } })
  │
  ▼ Relay startStreamPolling
  ├─ pollStream('control:{userId}', controlCursor)
  │     → 'cron_session_created' 이벤트 수신 → 앱이 새 세션 등록
  │     → 이후 해당 sessionId의 chat stream을 '0'부터 요청
  │
  └─ pollStream('chat:{userId}:{sid1}', cursor1) × N개 세션
        → 미수신 메시지 순차 전달 → useChatStore에 저장
```

### 순서 보장: 미존재 세션에 chat 메시지가 먼저 도착하는 경우

control(`cron_session_created`)과 chat은 별도 경로로 독립 전달되므로, chat 메시지가 먼저 도착할 수 있다.

**규칙: addMessage가 미존재 세션을 자동 upsert**

```
addMessage(msg) 호출 시:
  1. sessions[msg.sessionId]가 없으면 → 세션 자동 생성
     - sessions[msg.sessionId] = [msg]
     - sessionList에 { id, title: msg.content.slice(0,30), source: msg.source, ... } 추가
  2. 이후 cron_session_created가 도착하면 → 이미 존재하므로 무시 (idempotent)
```

이렇게 하면 chat이 먼저 오든 control이 먼저 오든 결과가 동일하다. `cron_session_created`는 "이 세션이 cron에 의해 생성되었다"는 힌트일 뿐, 세션 생성의 유일한 트리거가 아니다.

## API/인터페이스 계약

### Daemon → Relay (chat 채널) — 변경

| 메시지 타입 | 기존 필드 | 추가 필드 |
|------------|----------|----------|
| `typing` | userId, sessionId | — (cron이면 미전송) |
| `stream` | delta | `source: 'user' \| 'cron'` |
| `done` | content, toolResults, iterations | `source: 'user' \| 'cron'` |
| `error` | message | `source: 'user' \| 'cron'` |
| `cancelled` | — | `source: 'user' \| 'cron'` |
| **`tool_start`** (신규) | — | `toolName, toolCallId, sessionId, userId` |
| **`tool_done`** (신규) | — | `toolName, toolCallId, status: 'success'\|'error', sessionId, userId` |

### Daemon → Relay (control 채널) — 변경

| 메시지 타입 | 기존 필드 | 추가 필드 |
|------------|----------|----------|
| `message_queued` | messageId | `source: 'user' \| 'cron'`, `sessionId` |
| **`cron_session_created`** (신규) | — | `sessionId, cronId, userId` |

### App → Relay (authenticate) — 변경

| 필드 | 기존 | 추가 |
|------|------|------|
| token | JWT | — |
| lastStreamId | control cursor | — |
| **chatCursors** (신규) | — | `Record<sessionId, streamEntryId>` |

## 데이터 모델

### ChatMessage — Discriminated Union ("No Optional" 원칙 준수)

```typescript
// 공통 필드
interface ChatMessageBase {
  id: string
  content: string
  timestamp: number
  sessionId: string
  source: 'user' | 'cron'
}

// 사용자/AI 텍스트 메시지
interface TextChatMessage extends ChatMessageBase {
  kind: 'text'
  role: 'user' | 'assistant'
}

// Tool 실행 상태 메시지
interface ToolChatMessage extends ChatMessageBase {
  kind: 'tool'
  role: 'system'
  toolCall: string
  toolStatus: 'running' | 'done' | 'error'
}

// 상태 메시지 (cancelled만 — queued는 store-level 파생 UI 상태)
interface StatusChatMessage extends ChatMessageBase {
  kind: 'status'
  role: 'system'
  status: 'cancelled'
}

export type ChatMessage = TextChatMessage | ToolChatMessage | StatusChatMessage
```

각 variant에 optional 필드가 없다. `kind` discriminant로 타입 좁힘 가능.

### ChatSession (신규)

```typescript
export interface ChatSession {
  id: string
  title: string              // 첫 메시지 앞 30자 또는 "새 대화"
  lastMessageAt: number
  source: 'user' | 'cron'   // 세션 시작 주체
  messageCount: number
}
```

### ChatState (전면 재설계)

```typescript
interface ChatState {
  // 데이터
  sessions: Record<string, ChatMessage[]>
  sessionList: ChatSession[]
  currentSessionId: string | null
  isLoading: boolean
  isTyping: boolean
  streamCursors: Record<string, string>  // sessionId → lastStreamEntryId
  controlCursor: string

  // transient (비영속)
  queuedMessageId: string | null  // message_queued 수신 시 설정, done/error 시 해제

  // 액션
  addMessage: (message: ChatMessage) => void   // 미존재 세션 자동 upsert
  createSession: (source: 'user' | 'cron') => string  // source 필수
  switchSession: (sessionId: string) => void
  setLoading: (loading: boolean) => void
  setTyping: (typing: boolean) => void
  setQueuedMessageId: (id: string | null) => void
  updateCursor: (sessionId: string, entryId: string) => void
  updateControlCursor: (entryId: string) => void
}
```

**영속화 대상** (partialize):
- sessions, sessionList, currentSessionId, streamCursors, controlCursor
- **제외**: isLoading, isTyping, queuedMessageId (앱 재시작 시 항상 false/null)

## 테스트 전략

| 대상 | 레벨 | 방법 |
|------|------|------|
| useChatStore Record 구조 | unit | addMessage, createSession, switchSession 동작 검증 |
| zustand persist | integration | AsyncStorage mock으로 저장/복원 라운드트립 |
| daemon source 전파 | unit | _processChatDirect(source='cron') → relay.send 호출 시 source 포함 확인 |
| daemon tool 콜백 | unit | processChat(onToolStart/onToolDone) → 콜백 호출 확인 |
| 네비게이션 전환 | manual | ChatList → ChatDetail → back 제스처 |
| 오프라인 복구 | manual | 앱 종료 → cron 실행 → 앱 재시작 → 메시지 확인 |
| tsc --noEmit | CI | 타입 에러 없음 확인 |

## 실패/에러 처리

| 상황 | 처리 |
|------|------|
| AsyncStorage 저장 실패 | zustand persist 기본 동작 — 메모리에서 계속 동작, 다음 저장 시 재시도. "No Fallback" — 별도 대체 경로 없음 |
| 스트림 중 앱 백그라운드 전환 | streamMsgIdRef 유지. 포그라운드 복귀 시 relay reconnect → lastStreamId부터 이어받기 |
| MAX_MESSAGES_PER_SESSION 초과 | 가장 오래된 메시지부터 trim (useActivityStore MAX_EVENTS 패턴) |
| MAX_SESSIONS 초과 | lastMessageAt이 가장 오래된 세션 제거 |
| relay reconnect 시 chatCursors가 trim된 구간 참조 | Redis XREAD가 trim된 ID 이후부터 반환 — 데이터 손실 있으나 허용 가능 |

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| relay 변경이 v0.3.0과 충돌 | startStreamPolling 확장이 v0.3.0의 대규모 relay 변경과 merge conflict 발생 가능 | v0.3.1 relay 변경을 최소화. v0.3.0이 먼저 merge되면 rebase |
| AsyncStorage 용량 한계 | 50세션 * 500메시지 ≈ 수 MB. RN AsyncStorage는 기기별로 6MB~10MB 한계 | MAX 값 조정으로 관리. 향후 파일 시스템 마이그레이션 가능 |
| native-stack 의존성 호환성 | @react-navigation v7 + Expo 52 호환 필요 | Expo 52가 react-navigation v7 공식 지원 확인 |
