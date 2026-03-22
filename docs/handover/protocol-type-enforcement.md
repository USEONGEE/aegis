# 작업위임서 — Protocol 타입 강제 적용 (리터럴 직접 작성 제거)

> daemon/relay/app이 메시지 송수신 시 protocol 패키지의 공유 타입을 사용하지 않고 리터럴로 직접 작성하는 문제를 해소

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: `packages/protocol`, `packages/daemon`, `packages/relay`, `packages/app`

### What (무엇을)

**Phase A: daemon 송신 — protocol 타입 적용**
- [ ] `chat-handler.ts`에서 chat 메시지 송신 시 `ChatTypingEvent`, `ChatStreamEvent`, `ChatDoneEvent`, `ChatErrorEvent`, `ChatCancelledEvent`, `ChatToolStartEvent`, `ChatToolDoneEvent` 타입 import + 적용
- [ ] `index.ts`에서 event_stream 송신 시 `EventStreamEvent` 타입 적용
- [ ] `control-handler.ts`에서 ControlResult 송신 시 protocol 타입 import 확인

**Phase B: relay 라우팅 — protocol 타입 적용**
- [ ] `ws.ts`의 내부 `OutgoingMessage` 타입을 protocol의 공유 타입으로 교체 또는 protocol에서 derive
- [ ] daemon/app 핸들러에서 수신 메시지 파싱 시 `ControlMessage`, `ChatEvent` 등 protocol 타입으로 narrowing

**Phase C: app 송수신 — protocol 타입 적용**
- [ ] `RelayClient.ts`의 `type: 'control' | 'chat'` 직접 정의를 protocol의 `RelayChannel`로 교체
- [ ] control 메시지 생성 시 `ControlMessage` 타입 적용 확인
- [ ] event_stream 수신 시 `EventStreamEvent` → `AnyWDKEvent` narrowing 적용

**Phase D: CI 체크 추가 (선택)**
- [ ] protocol 타입을 우회하는 리터럴 송신 패턴을 감지하는 CI 체크 검토
- [ ] 예: `relayClient.send('chat', {` 뒤에 protocol 타입 assertion이 없으면 경고

### When (언제)
- 선행 조건: ws-channel-redesign 완료 후 (채널 구조가 확정된 뒤에 타입을 강제해야 함)
- 기한 없음

### Where (어디서)

| 파일 | 현재 상태 | 변경 |
|------|----------|------|
| `packages/daemon/src/chat-handler.ts` | 리터럴로 chat 메시지 직접 작성 | protocol ChatEvent 타입 import + 적용 |
| `packages/daemon/src/index.ts` | 리터럴로 event_stream 직접 작성 | protocol EventStreamEvent 적용 |
| `packages/relay/src/routes/ws.ts` | 내부 OutgoingMessage 자체 정의 | protocol 타입에서 derive |
| `packages/app/src/core/relay/RelayClient.ts` | `'control' \| 'chat'` 직접 정의 | protocol RelayChannel import |

### Why (왜)

protocol 패키지에 `ChatEvent`(7종), `ControlMessage`(8종), `ControlResult`, `ControlEvent`, `RelayEnvelope` 타입이 잘 정의되어 있지만, **소비자(daemon/relay/app)가 import하지 않고 리터럴로 직접 작성**하고 있다.

문제:
1. **protocol 타입과 실제 메시지 구조가 어긋나도 컴파일 에러가 안 남** — 필드 누락, 오타가 런타임까지 가야 발견됨
2. **protocol 타입을 수정해도 소비자가 따라가지 않음** — 타입 변경의 의미가 없어짐
3. **ws-channel-redesign에서 query/query_result 타입을 추가해도 같은 패턴이 반복될 수 있음**

### How (어떻게)

**daemon chat-handler.ts 예시:**
```ts
// Before: 리터럴 직접 작성
relayClient.send('chat', {
  type: 'typing',
  userId,
  sessionId
})

// After: protocol 타입 적용
import type { ChatTypingEvent } from '@wdk-app/protocol'

const event: ChatTypingEvent = { type: 'typing', userId, sessionId }
relayClient.send('chat', event)
```

**relay ws.ts 예시:**
```ts
// Before: 내부 자체 타입
interface OutgoingMessage {
  type: string
  id?: string
  userId?: string
  payload?: unknown
  ...
}

// After: protocol에서 derive 또는 직접 import
import type { RelayEnvelope } from '@wdk-app/protocol'
// OutgoingMessage를 RelayEnvelope 기반으로 정의
```

**relayClient.send() 시그니처 강화:**
```ts
// Before: 느슨한 타입
send(type: 'control' | 'chat', payload: unknown): void

// After: 채널별 타입 강제
send(type: 'chat', payload: ChatEvent): void
send(type: 'control', payload: ControlMessage): void
```

이렇게 하면 리터럴로 보내도 `ChatEvent`에 맞지 않으면 컴파일 에러.

워크플로우: `/phase-workflow` 또는 직접 구현

---

## 맥락

### protocol 패키지의 역할

`packages/protocol/src/`는 app ↔ relay ↔ daemon 사이에 WS로 주고받는 메시지의 **공유 타입 정의**를 담당한다. 3개 파일로 구성:

- `chat.ts` — AI 대화 메시지: `ChatEvent` DU (typing, stream, done, error, cancelled, tool_start, tool_done 7종)
- `control.ts` — 승인/취소/이벤트: `ControlMessage` DU (8종), `ControlResult` DU, `ControlEvent` DU (message_queued, message_started, cron_session_created, event_stream)
- `relay.ts` — 전송 봉투: `RelayChannel` ('control' | 'chat'), `RelayEnvelope` (type, payload, encrypted, sessionId, userId 등)

이 타입들이 제대로 쓰이면, 한쪽이 메시지 구조를 바꿀 때 다른 쪽에서 **컴파일 에러**가 나서 즉시 발견된다.

### 문제: 소비자가 protocol 타입을 안 쓴다

daemon이 chat 메시지를 보낼 때 실제 코드:
```ts
// daemon/src/chat-handler.ts — 리터럴로 직접 작성
relayClient.send('chat', { type: 'typing', userId, sessionId })
relayClient.send('chat', { type: 'stream', userId, sessionId, delta, source })
relayClient.send('chat', { type: 'done', userId, sessionId, content, toolResults, ... })
```

protocol에 `ChatTypingEvent`, `ChatStreamEvent`, `ChatDoneEvent` 타입이 정의되어 있는데 **import하지 않고** 객체 리터럴로 보낸다. 필드를 빼먹거나 오타를 내도 컴파일이 통과한다.

relay도 마찬가지로 `ws.ts`에서 자체 `OutgoingMessage` 인터페이스를 정의하고, protocol 타입을 참조하지 않는다.

app도 `RelayClient.ts`에서 `type: 'control' | 'chat'`을 직접 정의한다. protocol의 `RelayChannel`을 import하면 되는데 안 한다.

결과: protocol 타입을 수정해도 소비자 코드가 따라가지 않아서, **protocol이 문서 역할만 하고 실제 타입 안전성을 제공하지 못한다.**

### 현재 사용 현황 테이블

| protocol 타입 | daemon | relay | app |
|--------------|--------|-------|-----|
| `ChatEvent` (7종) | X (리터럴) | X (자체 타입) | 부분적 |
| `ControlMessage` (8종) | import O | X | import O |
| `ControlResult` | import O | X | 부분적 |
| `ControlEvent` (4종) | X (리터럴) | X | X |
| `RelayEnvelope` | X | X (자체 정의) | X |
| `RelayChannel` | X | X | X (직접 정의) |

O = protocol에서 import해서 사용, X = 리터럴 또는 자체 정의로 우회

### 사용자 확정 결정사항
- daemon/relay/app 모두 protocol 타입을 import해서 사용하도록 강제
- relayClient.send() 시그니처를 채널별 타입으로 오버로드하여 컴파일 타임 체크
- ws-channel-redesign에서 query/query_result 타입이 protocol에 추가된 뒤에 강제해야 의미 있음

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| ws-channel-redesign | `docs/handover/ws-channel-redesign.md` | 채널 구조 확정 후 타입 강제 |
| daemon 아키텍처 | `docs/report/daemon-architecture-one-pager.md` | 통신 채널 전체 맵 |
| protocol chat.ts | `packages/protocol/src/chat.ts` | ChatEvent DU 정의 |
| protocol control.ts | `packages/protocol/src/control.ts` | ControlMessage/Result/Event 정의 |
| protocol relay.ts | `packages/protocol/src/relay.ts` | RelayChannel, RelayEnvelope 정의 |

---

## 주의사항
- ws-channel-redesign이 먼저 완료되어야 함 — query/query_result 타입이 protocol에 추가된 뒤에 강제해야 의미 있음
- relay의 ws.ts는 내부적으로 Redis stream entry를 변환하는 로직이 있어서 OutgoingMessage를 단순히 protocol 타입으로 교체하기 어려울 수 있음 — 변환 레이어 필요
- `relayClient.send()` 오버로드 시 기존 호출부 전체 수정 필요

## 시작 방법
```
ws-channel-redesign 완료 후 착수

Phase A(daemon) → Phase B(relay) → Phase C(app) 순서 권장
Phase D(CI 체크)는 A~C 완료 후 선택
```
