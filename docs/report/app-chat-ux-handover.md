# App 채팅 UX 인수인계서

> Daemon 채팅 인프라는 완성되어 있으나, App 쪽 UX가 미완성인 5가지 항목의 **구체적 구현 설계**를 포함한 인수인계 문서.

---

## 현황 요약

| # | 항목 | 현재 상태 | 필요 작업 |
|---|------|----------|----------|
| 1 | 세션별 대화창 | **미구현** — 단일 세션만 표시 | 세션 목록 + 세션 전환 UI |
| 2 | Tool calls 실시간 표시 | **미구현** — 메타데이터 필드만 존재 | daemon 콜백 + 앱 렌더링 |
| 3 | Cron 메시지 표시 | **미구현** — 핸들러 없음 | source 태그 전파 + 앱 표시 |
| 4 | 메시지 수신 흐름 UX | **부분 구현** | message_queued/cancelled 핸들러 추가 |
| 5 | 대화 이력 영속성 | **미구현** — 메모리만 | zustand persist + AsyncStorage |

**권장 순서**: 5 → 1 → 4 → 3 → 2

---

## 항목 5. 대화 이력 영속성 (최우선)

### 현재
```typescript
// useChatStore.ts — 메모리만. persist 없음.
export const useChatStore = create<ChatState>((set) => ({
  messages: [],           // ← 앱 재시작 시 소실
  currentSessionId: null,
  isLoading: false,
  // ...
}))
```

### 구현 설계

**useChatStore.ts 전체 재구성:**

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  sessionId: string
  source: 'user' | 'cron'           // ← 추가: 누가 보낸 메시지인지
  metadata?: {
    toolCall?: string
    toolStatus?: 'running' | 'done' | 'error'
  }
}

export interface ChatSession {
  id: string
  title: string                      // 첫 메시지 앞 30자 또는 "새 대화"
  lastMessageAt: number
  source: 'user' | 'cron'           // 세션 시작 주체
  messageCount: number
}

interface ChatState {
  // 데이터
  sessions: Record<string, ChatMessage[]>   // sessionId → messages
  sessionList: ChatSession[]                // 세션 목록 (정렬용)
  currentSessionId: string | null
  isLoading: boolean
  isTyping: boolean

  // 액션
  addMessage: (message: ChatMessage) => void
  getSessionMessages: (sessionId: string) => ChatMessage[]
  createSession: (source?: 'user' | 'cron') => string
  switchSession: (sessionId: string) => void
  setLoading: (loading: boolean) => void
  setTyping: (typing: boolean) => void
}

export const useChatStore = create(
  persist<ChatState>(
    (set, get) => ({
      sessions: {},
      sessionList: [],
      currentSessionId: null,
      isLoading: false,
      isTyping: false,

      addMessage: (message) => set((state) => {
        const sid = message.sessionId
        const existing = state.sessions[sid] || []

        // 같은 id의 메시지가 있으면 덮어쓰기 (stream 버퍼 업데이트)
        const idx = existing.findIndex(m => m.id === message.id)
        const updated = idx >= 0
          ? [...existing.slice(0, idx), message, ...existing.slice(idx + 1)]
          : [...existing, message]

        // 세션 목록 업데이트
        const sessionIdx = state.sessionList.findIndex(s => s.id === sid)
        const sessionList = [...state.sessionList]
        if (sessionIdx >= 0) {
          sessionList[sessionIdx] = {
            ...sessionList[sessionIdx],
            lastMessageAt: message.timestamp,
            messageCount: updated.length
          }
        }

        return {
          sessions: { ...state.sessions, [sid]: updated },
          sessionList
        }
      }),

      getSessionMessages: (sessionId) => get().sessions[sessionId] || [],

      createSession: (source = 'user') => {
        const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        set((state) => ({
          currentSessionId: id,
          sessionList: [
            { id, title: '새 대화', lastMessageAt: Date.now(), source, messageCount: 0 },
            ...state.sessionList
          ],
          sessions: { ...state.sessions, [id]: [] }
        }))
        return id
      },

      switchSession: (sessionId) => set({ currentSessionId: sessionId }),

      setLoading: (isLoading) => set({ isLoading }),
      setTyping: (isTyping) => set({ isTyping }),
    }),
    {
      name: 'wdk-chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // isLoading, isTyping은 영속화하지 않음
        sessions: state.sessions,
        sessionList: state.sessionList,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
)
```

**의존성 추가:**
```bash
cd packages/app && npx expo install @react-native-async-storage/async-storage
```

### 완료 조건
- [ ] 앱 재시작 후 이전 대화 메시지가 유지됨
- [ ] `sessions` Record가 sessionId별로 메시지를 분리 저장
- [ ] `sessionList`가 세션 목록을 lastMessageAt 역순으로 유지
- [ ] `isLoading`/`isTyping`은 영속화되지 않음 (앱 재시작 시 false)

---

## 항목 1. 세션별 대화창

### 현재
```typescript
// RootNavigator.tsx — Chat 탭이 바로 ChatScreen
<Tab.Screen name="Chat" component={ChatScreen} />
```

### 구현 설계

**네비게이션 구조 변경:**

```
Chat 탭 (Stack Navigator)
  ├── ChatListScreen (세션 목록)
  │     ├── "새 대화" 버튼 → createSession() → ChatDetailScreen
  │     └── 세션 카드 탭 → switchSession() → ChatDetailScreen
  └── ChatDetailScreen (기존 ChatScreen 리네임)
```

**RootNavigator.tsx 변경:**

```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack'

export type ChatStackParamList = {
  ChatList: undefined
  ChatDetail: { sessionId: string }
}

const ChatStack = createNativeStackNavigator<ChatStackParamList>()

function ChatNavigator () {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} />
      <ChatStack.Screen name="ChatDetail" component={ChatDetailScreen} />
    </ChatStack.Navigator>
  )
}

// Tab.Navigator에서:
<Tab.Screen name="Chat" component={ChatNavigator} />
```

**ChatListScreen (신규):**

```typescript
// domains/chat/screens/ChatListScreen.tsx
export function ChatListScreen ({ navigation }) {
  const { sessionList, createSession } = useChatStore()

  return (
    <View>
      <Pressable onPress={() => {
        const id = createSession()
        navigation.navigate('ChatDetail', { sessionId: id })
      }}>
        <Text>+ 새 대화</Text>
      </Pressable>

      <FlatList
        data={sessionList.sort((a, b) => b.lastMessageAt - a.lastMessageAt)}
        renderItem={({ item }) => (
          <Pressable onPress={() => {
            switchSession(item.id)
            navigation.navigate('ChatDetail', { sessionId: item.id })
          }}>
            <Text>{item.title}</Text>
            <Text>{item.source === 'cron' ? '🤖 자동 실행' : ''}</Text>
            <Text>{new Date(item.lastMessageAt).toLocaleDateString()}</Text>
          </Pressable>
        )}
      />
    </View>
  )
}
```

**ChatDetailScreen**: 기존 `ChatScreen.tsx`를 리네임. `route.params.sessionId`에서 세션 ID를 받도록 변경.

### 파일 변경 목록
| 파일 | 동작 | 변경 |
|------|------|------|
| `app/src/app/RootNavigator.tsx` | 수정 | Chat 탭을 Stack Navigator로 교체 |
| `app/src/domains/chat/screens/ChatListScreen.tsx` | **생성** | 세션 목록 화면 |
| `app/src/domains/chat/screens/ChatScreen.tsx` | 수정 → 리네임 `ChatDetailScreen.tsx` | `route.params.sessionId` 사용, `createSession` 제거 |

### 완료 조건
- [ ] 세션 목록 화면에서 이전 대화를 탭하면 해당 세션의 메시지가 로드됨
- [ ] "새 대화" 버튼으로 새 세션 생성 후 대화 시작
- [ ] 세션 목록이 lastMessageAt 역순 정렬
- [ ] cron 세션에 "🤖 자동 실행" 라벨 표시

---

## 항목 4. 메시지 수신 흐름 UX

### 현재

| relay 메시지 | 앱 핸들러 | UI 표시 |
|-------------|----------|---------|
| `message_queued` | ✅ pendingMessageId 저장 | ❌ 사용자에게 미표시 |
| `typing` | ✅ isTyping=true | ✅ "AI is typing..." |
| `stream` + delta | ✅ 버퍼 누적 | ✅ 실시간 텍스트 |
| `done` | ✅ 버퍼 초기화 | ✅ 최종 응답 |
| `error` | ✅ 에러 표시 | ✅ 에러 메시지 |
| `cancelled` | ❌ 핸들러 없음 | ❌ 미처리 |

### 구현 설계

**ChatDetailScreen.tsx에 추가할 case:**

```typescript
// message_queued 수신 시 (기존 코드에 UI 표시 추가)
case 'message_queued': {
  // 사용자 메시지 버블에 "전송됨 ✓" 표시
  // 가장 마지막 user 메시지의 metadata.status를 'queued'로 업데이트
  const msgs = useChatStore.getState().getSessionMessages(currentSessionId!)
  const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
  if (lastUserMsg) {
    addMessage({ ...lastUserMsg, metadata: { ...lastUserMsg.metadata, status: 'queued' } })
  }
  return
}

// cancelled 수신 시 (신규)
case 'cancelled': {
  setLoading(false)
  setTyping(false)
  streamBufferRef.current = ''
  streamMsgIdRef.current = null
  addMessage({
    id: `msg_cancelled_${Date.now()}`,
    role: 'system',
    content: '요청이 취소되었습니다.',
    timestamp: Date.now(),
    sessionId: currentSessionId!,
    source: 'user'
  })
  return
}
```

**메시지 버블에 status 표시 (renderMessage 수정):**

```typescript
// user 메시지 버블 하단에:
{item.role === 'user' && item.metadata?.status === 'queued' && (
  <Text style={styles.statusText}>전송됨 ✓</Text>
)}
```

### 완료 조건
- [ ] 메시지 전송 후 `message_queued` 수신 시 "전송됨 ✓" 표시
- [ ] 취소 시 `cancelled` 수신 → "요청이 취소되었습니다" 시스템 메시지
- [ ] typing/stream/done/error 기존 동작 유지

---

## 항목 3. Cron 메시지 표시

### 현재
- `QueuedMessage.source`에 `'user' | 'cron'` 구분이 있음
- 하지만 `_processChatDirect()`는 `source`를 받지 않으므로 relay 메시지에 포함 안 됨
- 앱은 현재 세션 아닌 메시지를 무시함 (`data.sessionId !== currentSessionId`)

### 구현 설계 — Source 태그 전파 경로

**문제**: `QueuedMessage.source`가 `_processChatDirect()`까지 전달되지 않음.

**해결 경로:**

```
QueuedMessage { source: 'cron' }
       │
       ▼  index.ts:68 — queue processor
_processChatDirect(userId, sessionId, text, ...)
       │ ← source 파라미터 추가 필요
       ▼
relayClient.send('chat', { type: 'typing', ..., source })  ← source 포함
relayClient.send('chat', { type: 'stream', ..., source })  ← source 포함
relayClient.send('chat', { type: 'done', ..., source })    ← source 포함
```

**Daemon 변경 (3파일):**

```typescript
// 1. chat-handler.ts — _processChatDirect에 source 파라미터 추가
export async function _processChatDirect (
  userId: string,
  sessionId: string,
  text: string,
  openclawClient: OpenClawClient,
  relayClient: RelayClient,
  ctx: ToolExecutionContext,
  opts: ChatHandlerOptions = {},
  signal?: AbortSignal,
  source: 'user' | 'cron' = 'user'    // ← 추가
): Promise<void> {
  // typing — cron이면 스킵
  if (source !== 'cron') {
    relayClient.send('chat', { type: 'typing', userId, sessionId })
  }

  // ... processChat 호출 ...

  // done에 source 포함
  relayClient.send('chat', {
    type: 'done', userId, sessionId,
    content: result.content,
    toolResults: result.toolResults,
    iterations: result.iterations,
    source                              // ← 추가
  })
}

// handleChatMessage에서도 direct 호출 시:
await _processChatDirect(userId, sessionId, text, ..., undefined, 'user')
```

```typescript
// 2. index.ts:68 — queue processor에서 source 전달
async (msg: QueuedMessage, signal: AbortSignal) => {
  await _processChatDirect(
    msg.userId, msg.sessionId, msg.text,
    openclawClient, relayClient, ctx,
    { maxIterations: config.toolCallMaxIterations },
    signal,
    msg.source                          // ← 'user' | 'cron' 전달
  )
}
```

```typescript
// 3. cron-scheduler.ts의 dispatch 콜백 (index.ts:139)
// 이미 source: 'cron'으로 enqueue하고 있으므로 변경 불필요
queueManager.enqueue(sessionId, {
  sessionId, source: 'cron', userId, text: prompt, ...
})
```

**App 변경:**

```typescript
// ChatDetailScreen.tsx — sessionId 필터링 완화
// 현재: data.sessionId !== currentSessionId → return
// 변경: 현재 세션이 아닌 메시지도 저장 (다만 현재 화면에는 표시 안 함)

if (message.channel !== 'chat') return

// 항상 저장 (세션 목록에서 볼 수 있도록)
const msgSessionId = data.sessionId
addMessage({
  id: `msg_${Date.now()}`,
  role: 'assistant',
  content: data.content,
  timestamp: message.timestamp,
  sessionId: msgSessionId,
  source: data.source || 'user'      // ← source 저장
})

// 현재 화면 업데이트는 현재 세션만
if (msgSessionId !== currentSessionId) return
// ... UI 업데이트 로직
```

### 완료 조건
- [ ] Daemon: `done`/`stream` 메시지에 `source: 'user' | 'cron'` 포함
- [ ] Daemon: cron 메시지에서 typing indicator 전송 안 함
- [ ] App: cron 세션 메시지가 저장되어 세션 목록에서 "🤖 자동 실행"으로 구분됨
- [ ] App: cron 세션 대화를 열면 AI 응답이 정상 표시됨

---

## 항목 2. Tool Calls 실시간 표시

### 현재
- `processChat()`은 `onDelta` 콜백만 있고, tool 관련 콜백 없음
- v0.2.10에서 `relayClient`를 `ToolExecutionContext`에서 제거했으므로, `processChat` 내부에서 relay 직접 접근 불가

### 구현 설계 — 콜백 패턴

**Daemon 변경 (2파일):**

```typescript
// 1. tool-call-loop.ts — ProcessChatOptions에 콜백 추가
export interface ProcessChatOptions {
  maxIterations?: number
  onDelta?: ((delta: string) => void) | null
  signal?: AbortSignal
  onToolStart?: (toolName: string, toolCallId: string) => void   // ← 추가
  onToolDone?: (toolName: string, toolCallId: string, ok: boolean) => void  // ← 추가
}

// processChat() 내부 tool 실행 부분 (line 132~):
for (const toolCall of assistantMessage.tool_calls) {
  const fnName = toolCall.function.name

  // 도구 실행 시작 알림
  opts.onToolStart?.(fnName, toolCall.id)

  let result: AnyToolResult
  try {
    result = await executeToolCall(fnName, fnArgs, ctx)
    // 도구 실행 완료 알림
    opts.onToolDone?.(fnName, toolCall.id, true)
  } catch (err: any) {
    opts.onToolDone?.(fnName, toolCall.id, false)
    result = { status: 'error', error: err.message }
  }
  // ...
}
```

```typescript
// 2. chat-handler.ts — _processChatDirect에서 콜백 구현
const result = await processChat(
  userId, sessionId, text, ctx, openclawClient,
  {
    maxIterations: opts.maxIterations || 10,
    signal,
    onDelta: (delta) => {
      relayClient.send('chat', { type: 'stream', userId, sessionId, delta })
    },
    onToolStart: (toolName, toolCallId) => {
      relayClient.send('chat', {
        type: 'tool_start', userId, sessionId, toolName, toolCallId
      })
    },
    onToolDone: (toolName, toolCallId, ok) => {
      relayClient.send('chat', {
        type: 'tool_done', userId, sessionId, toolName, toolCallId,
        status: ok ? 'success' : 'error'
      })
    }
  }
)
```

**App 변경 (ChatDetailScreen.tsx):**

```typescript
// relay 핸들러에 tool_start/tool_done case 추가
case 'tool_start': {
  setTyping(false)  // typing 대신 tool 표시
  addMessage({
    id: `tool_${data.toolCallId}`,
    role: 'system',
    content: `🔧 ${data.toolName}`,
    timestamp: message.timestamp,
    sessionId: currentSessionId!,
    source: 'user',
    metadata: { toolCall: data.toolName, toolStatus: 'running' }
  })
  return
}

case 'tool_done': {
  // 기존 tool 메시지를 업데이트
  addMessage({
    id: `tool_${data.toolCallId}`,
    role: 'system',
    content: data.status === 'success'
      ? `✅ ${data.toolName} 완료`
      : `❌ ${data.toolName} 실패`,
    timestamp: message.timestamp,
    sessionId: currentSessionId!,
    source: 'user',
    metadata: { toolCall: data.toolName, toolStatus: data.status === 'success' ? 'done' : 'error' }
  })
  return
}
```

**메시지 렌더링 (renderMessage 수정):**

```typescript
// tool 메시지는 작은 글씨로 표시
if (item.metadata?.toolCall) {
  return (
    <View style={styles.toolIndicator}>
      <Text style={styles.toolText}>
        {item.metadata.toolStatus === 'running' && `🔧 ${item.metadata.toolCall} 실행 중...`}
        {item.metadata.toolStatus === 'done' && `✅ ${item.metadata.toolCall} 완료`}
        {item.metadata.toolStatus === 'error' && `❌ ${item.metadata.toolCall} 실패`}
      </Text>
    </View>
  )
}
```

### 완료 조건
- [ ] AI가 `getBalance` 호출 시 앱에 "🔧 getBalance 실행 중..." 표시
- [ ] 도구 실행 완료 시 "✅ getBalance 완료"로 변경
- [ ] 여러 도구를 연속 호출하면 각각 표시
- [ ] 도구 실행 에러 시 "❌ getBalance 실패" 표시

---

## 전체 파일 변경 목록

### Daemon (packages/daemon)

| 파일 | 항목 | 변경 내용 |
|------|------|----------|
| `src/tool-call-loop.ts` | 2 | `ProcessChatOptions`에 `onToolStart`/`onToolDone` 추가, 실행 전후 콜백 호출 |
| `src/chat-handler.ts` | 2,3 | `_processChatDirect`에 `source` 파라미터 추가, tool 콜백 구현, cron typing 스킵, relay 메시지에 source 포함 |
| `src/index.ts` | 3 | queue processor에서 `msg.source`를 `_processChatDirect`에 전달 |

### App (packages/app)

| 파일 | 항목 | 변경 내용 |
|------|------|----------|
| `src/stores/useChatStore.ts` | 5,1 | persist 미들웨어 + 세션별 저장 구조 전면 재구성 |
| `src/app/RootNavigator.tsx` | 1 | Chat 탭을 Stack Navigator로 교체 |
| `src/domains/chat/screens/ChatListScreen.tsx` | 1 | **신규** — 세션 목록 화면 |
| `src/domains/chat/screens/ChatScreen.tsx` → `ChatDetailScreen.tsx` | 1,2,3,4 | 리네임 + route params + tool_start/done 핸들러 + cancelled 핸들러 + source 저장 + message_queued UI |
| `package.json` | 5 | `@react-native-async-storage/async-storage` 의존성 추가 |

---

## 검증 시나리오

### 시나리오 A: 기본 대화 흐름
1. 앱 실행 → 세션 목록 화면 → "새 대화" → 대화 화면
2. "ETH 잔고 알려줘" 입력 → "전송됨 ✓" → "🔧 getBalance 실행 중..." → "✅ getBalance 완료" → AI 최종 응답
3. 앱 종료 후 재시작 → 세션 목록에 이전 대화 존재 → 탭하면 이력 로드

### 시나리오 B: Cron 메시지
1. AI가 "5분마다 잔고 체크" 크론 등록
2. 5분 후 크론 실행 → 세션 목록에 "🤖 자동 실행" 세션 생성
3. 해당 세션 탭 → AI 응답 확인 가능

### 시나리오 C: 취소
1. 메시지 전송 → 처리 중 → 취소 요청
2. "요청이 취소되었습니다" 시스템 메시지 표시

### 시나리오 D: 오프라인 복귀
1. 앱 종료 중 cron이 3회 실행
2. 앱 재시작 → 세션 목록에 cron 세션 + 3개 AI 응답 확인

---

**작성일**: 2026-03-21
**근거**: Explore Agent로 packages/app/src/ 15개 파일 + packages/daemon/src/ 15개 파일 분석
**기반 버전**: v0.2.9+v0.2.10+v0.2.11 daemon 리팩토링 완료 후
