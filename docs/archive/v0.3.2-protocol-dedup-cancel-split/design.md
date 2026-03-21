# 설계 - v0.3.2

## 변경 규모
**규모**: 일반 기능
**근거**: 새 패키지 생성(@wdk-app/protocol), 3개+ 패키지(daemon+app+protocol) 수정, 내부 API 변경(cancel 분리, signal 전파)

---

## 문제 요약
daemon/app 간 wire 타입 중복 정의 + cancel_message의 큐 제거/진행중 중단 미분리 + AbortSignal 미전파.

> 상세: [README.md](README.md) 참조

## 접근법

### 전체 전략
1. **@wdk-app/protocol 패키지**: wire 타입을 한 곳에서 정의, daemon/app이 import
2. **ChatMessage 네이밍 정리**: daemon 내부 2중 정의 해소
3. **cancel 분리**: cancel_queued / cancel_active 제어 메시지 분리
4. **AbortSignal 전파**: OpenClaw SDK까지 signal 전달 (SDK 지원 확인 완료: core.d.ts:215)

## 대안 검토

### 작업 A: 공통 타입 패키지

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A1: @wdk-app/protocol 신규 패키지 | 명확한 소유권, 양쪽 import | 패키지 설정 오버헤드 | ✅ |
| A2: canonical 패키지 확장 | 기존 패키지 재사용 | canonical은 해시 유틸 전용, 역할 혼재 | ❌ |
| A3: guarded-wdk에서 re-export | WDK가 wire 타입을 이미 정의 | app이 guarded-wdk 의존하게 됨 (역방향) | ❌ |

**A1 선택 이유**: canonical은 해시 함수 전용. guarded-wdk는 서명 엔진이지 wire 프로토콜 패키지가 아님. 별도 패키지가 역할 분리에 맞음.

### 작업 A: ChatMessage 네이밍

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| B1: daemon 내부에서 rename (RelayChatInput, OpenClawMessage) | daemon만 변경 | app은 여전히 독자 타입 | ❌ |
| B2: protocol에 WireChat 타입 정의, daemon/app 모두 import | 중복 제거 | protocol 패키지 필요 (A1과 결합) | ✅ |

### 작업 B: Cancel 분리

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| C1: cancel_queued + cancel_active 2개 메시지 타입 | 명시적 의도 전달, 앱이 적절한 UX 제공 가능 | ControlMessage variant 2개 추가 | ✅ |
| C2: cancel_message 유지 + wasProcessing으로 사후 구분 | 변경 최소 | 요청 intent가 분리 안 됨, 앱이 사전에 상태 모름 | ❌ |

### 작업 B: AbortSignal 전파

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| D1: signal을 processChat → OpenClaw SDK까지 전파 | HTTP 요청 실제 중단, 비용 절감 | OpenClaw client 시그니처 변경 | ✅ |
| D2: signal을 processChat 루프에서만 체크 (현재) | 변경 없음 | 진행중인 HTTP 요청은 끝까지 실행 | ❌ |

**D1 선택 이유**: OpenAI SDK가 `signal?: AbortSignal`을 지원 (core.d.ts:215). 전파만 하면 됨.

## 기술 결정

### @wdk-app/protocol 패키지 구조

```
packages/protocol/
  ├── package.json        # { "name": "@wdk-app/protocol", "type": "module" }
  ├── tsconfig.json
  └── src/
      ├── index.ts        # re-export all
      ├── control.ts      # ControlMessage union, SignedApprovalFields, ControlResult
      ├── chat.ts         # RelayChatInput (relay 메시지), ChatDonePayload, StreamPayload 등
      └── relay.ts        # RelayEnvelope, RelayChannel
```

### control.ts — 공유 타입

```typescript
// 현재 daemon control-handler.ts에서 이동
export interface SignedApprovalFields {
  requestId: string
  signature: string
  approverPubKey: string
  chainId: number
  accountIndex: number
  signerId: string
  targetHash: string
  policyVersion: number
  expiresAt: number
  nonce: number
  content: string
}

export interface PolicyApprovalPayload extends SignedApprovalFields {
  policies: Record<string, unknown>[]
}

export interface DeviceRevokePayload extends SignedApprovalFields {
  targetPublicKey: string
}

export interface PairingConfirmPayload {
  signerId: string
  identityPubKey: string
  encryptionPubKey: string
  pairingToken: string
  sas: string
}

export interface CancelQueuedPayload {
  messageId: string
}

export interface CancelActivePayload {
  messageId: string
}

export type ControlMessage =
  | { type: 'policy_approval'; payload: PolicyApprovalPayload }
  | { type: 'policy_reject'; payload: SignedApprovalFields }
  | { type: 'device_revoke'; payload: DeviceRevokePayload }
  | { type: 'wallet_create'; payload: SignedApprovalFields }
  | { type: 'wallet_delete'; payload: SignedApprovalFields }
  | { type: 'pairing_confirm'; payload: PairingConfirmPayload }
  | { type: 'cancel_queued'; payload: CancelQueuedPayload }
  | { type: 'cancel_active'; payload: CancelActivePayload }

// --- daemon → app 방향: ControlResult + ControlEvent ---

export interface ControlResult {
  ok: boolean
  type?: string
  requestId?: string
  messageId?: string
  error?: string
  reason?: string
  wasProcessing?: boolean
}

// daemon → app control 이벤트 (비동기 알림)
export interface MessageQueuedEvent {
  type: 'message_queued'
  userId: string
  sessionId: string
  messageId: string
}

export interface MessageStartedEvent {
  type: 'message_started'
  userId: string
  sessionId: string
  messageId: string
}

export interface CronSessionCreatedEvent {
  type: 'cron_session_created'
  sessionId: string
  cronId: string
}

export interface EventStreamEvent {
  type: 'event_stream'
  eventName: string
  event: unknown
}

export type ControlEvent =
  | MessageQueuedEvent
  | MessageStartedEvent
  | CronSessionCreatedEvent
  | EventStreamEvent
```

> `ControlMessage`는 app→daemon 요청, `ControlEvent`는 daemon→app 비동기 이벤트. 양방향 wire contract를 `control.ts` 한 파일에서 관리.

### chat.ts — 공유 타입

```typescript
// relay wire 채팅 메시지 (daemon → app)
export interface RelayChatInput {
  userId: string
  sessionId: string
  text: string
}

export interface ChatTypingEvent {
  type: 'typing'
  userId: string
  sessionId: string
}

export interface ChatStreamEvent {
  type: 'stream'
  userId: string
  sessionId: string
  delta: string
  source?: 'user' | 'cron'
}

export interface ChatDoneEvent {
  type: 'done'
  userId: string
  sessionId: string
  content: string | null
  toolResults: unknown[]
  iterations: number
  source?: 'user' | 'cron'
}

export interface ChatErrorEvent {
  type: 'error'
  userId: string
  sessionId: string
  error: string
}

export interface ChatCancelledEvent {
  type: 'cancelled'
  userId: string
  sessionId: string
}

export type ChatEvent =
  | ChatTypingEvent
  | ChatStreamEvent
  | ChatDoneEvent
  | ChatErrorEvent
  | ChatCancelledEvent
```

### Cancel 분리 — 앱이 cancel 종류를 판단하는 방법

현재 앱은 `message_queued` 시점에 `messageId`를 받고, 이후 typing/stream/done에는 `messageId`가 없어 메시지가 큐에 있는지 처리 중인지 알 수 없다.

**해결**: daemon이 큐에서 꺼내 처리를 시작할 때 `message_started` control 이벤트를 전송:

```typescript
// index.ts — queue processor에서 처리 시작 시
relayClient.send('control', {
  type: 'message_started',
  userId: msg.userId,
  sessionId: msg.sessionId,
  messageId: msg.messageId
})
```

앱의 판단 로직:
```
message_queued 수신 → 상태 = 'queued'
message_started 수신 → 상태 = 'active'

취소 버튼 클릭:
  상태 === 'queued' → cancel_queued 전송
  상태 === 'active' → cancel_active 전송
```

### tool execution 취소 범위

이번 Phase는 **OpenClaw HTTP 요청 abort**만 다룬다. `executeToolCall()` 내부의 WDK 호출(sendTransaction 등)에 signal을 전파하는 것은 guarded-wdk 변경이 필요하므로 범위 밖. WDK 호출 중 abort가 오면, 루프의 다음 iteration 시작 전에 감지하여 종료한다 (현재 동작 유지).

### Cancel 분리 — daemon 변경

```typescript
// control-handler.ts — 기존 cancel_message를 2개로 분리

case 'cancel_queued': {
  const { messageId } = msg.payload
  if (!messageId || !queueManager) {
    return { ok: false, type: 'cancel_queued', error: 'Missing messageId or queue' }
  }
  const result = queueManager.cancelQueued(messageId)  // 큐에서만 제거
  return { ok: result.ok, type: 'cancel_queued', messageId, reason: result.reason }
}

case 'cancel_active': {
  const { messageId } = msg.payload
  if (!messageId || !queueManager) {
    return { ok: false, type: 'cancel_active', error: 'Missing messageId or queue' }
  }
  const result = queueManager.cancelActive(messageId)  // abort signal 전파
  return { ok: result.ok, type: 'cancel_active', messageId, wasProcessing: result.wasProcessing }
}
```

### AbortSignal 전파 경로

```
cancel_active → queueManager.cancelActive(id) → abortController.abort()
  │
  ▼ signal propagation:
_processChatDirect(..., signal)
  │
  ▼
processChat(..., { signal })
  │
  ├── 루프 시작에서 signal.aborted 체크 (기존)
  │
  ├── openclawClient.chat(..., { signal })    ← 신규: SDK에 signal 전달
  │     └── OpenAI SDK가 HTTP 요청 abort
  │
  └── openclawClient.chatStream(..., { signal }) ← 신규: 스트리밍도 abort
```

**OpenClawClient 시그니처 변경:**

```typescript
// 현재
chat(userId, sessionId, messages, tools): Promise<ChatResponse>
chatStream(userId, sessionId, messages, tools, onDelta): Promise<ChatResponse>

// 변경
chat(userId, sessionId, messages, tools, opts?: { signal?: AbortSignal }): Promise<ChatResponse>
chatStream(userId, sessionId, messages, tools, onDelta, opts?: { signal?: AbortSignal }): Promise<ChatResponse>
```

### SessionMessageQueue 변경

```typescript
// 현재: cancel(messageId) — 큐/진행중 구분 없이 처리
// 변경: 2개로 분리

cancelQueued(messageId: string): CancelResult {
  const idx = this._queue.findIndex(m => m.messageId === messageId)
  if (idx === -1) return { ok: false, reason: 'not_found' }
  this._queue.splice(idx, 1)
  return { ok: true, wasProcessing: false }
}

cancelActive(messageId: string): CancelResult {
  if (this._processing?.messageId !== messageId) {
    return { ok: false, reason: 'not_found' }
  }
  this._processing.abortController.abort()
  return { ok: true, wasProcessing: true }
}
```

## 범위 / 비범위

- **범위**: protocol 패키지 생성, daemon/app import 변경, cancel 분리, signal 전파
- **비범위**: E2E crypto 통합, RelayClient 통합, 해시 함수 통합, relay 서버 변경

## 테스트 전략

- daemon tsc 통과 (기존 baseline 이하)
- app tsc 통과 (Metro bundler 제약으로 별도 확인)
- daemon control-handler 테스트: cancel_queued/cancel_active 분리 테스트
- daemon message-queue 테스트: cancelQueued/cancelActive 분리 테스트

## 변경 파일 목록

### 신규
| 파일 | 내용 |
|------|------|
| `packages/protocol/package.json` | @wdk-app/protocol 패키지 설정 |
| `packages/protocol/tsconfig.json` | TS 설정 |
| `packages/protocol/src/index.ts` | re-export |
| `packages/protocol/src/control.ts` | ControlMessage, SignedApprovalFields 등 |
| `packages/protocol/src/chat.ts` | RelayChatInput, ChatEvent 등 |
| `packages/protocol/src/relay.ts` | RelayEnvelope, RelayChannel |

### 수정
| 파일 | 내용 |
|------|------|
| `packages/daemon/src/control-handler.ts` | 타입 import 변경 → @wdk-app/protocol. cancel_message → cancel_queued + cancel_active 분리 |
| `packages/daemon/src/chat-handler.ts` | ChatMessage → RelayChatInput import |
| `packages/daemon/src/openclaw-client.ts` | chat/chatStream에 signal 파라미터 추가 |
| `packages/daemon/src/tool-call-loop.ts` | signal을 openclawClient에 전달 |
| `packages/daemon/src/message-queue.ts` | cancel() → cancelQueued() + cancelActive() 분리 |
| `packages/daemon/src/index.ts` | ControlMessage import 경로, cancel handler 분기 |
| `packages/daemon/tests/control-handler.test.ts` | cancel 테스트 분리 |
| `packages/app/src/core/approval/types.ts` | SignedApprovalPayload → @wdk-app/protocol에서 import |
| `packages/app/src/core/relay/RelayClient.ts` | cancel_message → cancel_queued/cancel_active 분기 |
| `packages/app/src/stores/useChatStore.ts` | queuedMessageId → messageState ('queued'/'active') + cancel 분기 |
| `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` | cancel 버튼에서 상태 기반 cancel_queued/cancel_active 분기 + message_started 핸들러 |
| `package.json` (루트) | workspace에 packages/protocol 추가 |
