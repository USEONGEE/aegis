# 설계 - v0.4.8

## 변경 규모
**규모**: 일반 기능
**근거**: 4개 패키지(protocol, daemon, relay, app) 동시 수정 + wire protocol 채널 확장(2→5) + 새로운 통신 패턴(query request-response) 추가. 단, DB 스키마 변경 없음, 외부 API 변경 없음, 단일 팀 소유이므로 서비스 경계까지는 아님.

---

## 문제 요약
WS 채널이 비일관적(control 양방향, 이중 전달, 조회 경로 부재)이고, protocol 타입이 소비자에게 강제되지 않아 컴파일 타임 안전성이 없다.

> 상세: [README.md](README.md) 참조

## 접근법

Scope A(채널 재설계) → Scope B(타입 강제) 순차 진행.

- **Scope A**: cancel→event_stream 전환, control 단방향화, relay 이중 전달 제거, query/query_result 채널 신설
- **Scope B**: daemon/relay/app 모든 메시지 송수신에서 protocol 타입 import + send() 오버로드

Phase A~C(채널 정리)와 Phase D(query 추가)는 relay ws.ts의 수정 영역이 겹치지 않으므로 병렬 가능.

## 대안 검토

### Scope A: 채널 재설계

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A1: 점진적 순차 (cancel→이중전달→query) | 각 단계 테스트 가능, 롤백 단위 작음 | 중간 상태 발생, relay 3번 수정 | ❌ |
| A2: 빅뱅 전환 | 중간 상태 없음, relay 1번 수정 | 변경 규모 커서 디버깅 어려움 | ❌ |
| A3: 점진적 + query 병렬 | A~C 순차로 리스크 격리 + D 병렬로 효율 | relay 수정 영역 충돌 가능(실제로는 기존 핸들러 vs 신규 핸들러로 분리) | ✅ |

**선택 이유**: A3. Phase A~C(기존 핸들러 수정)와 Phase D(신규 핸들러 추가)는 relay ws.ts에서 수정 영역이 명확히 다름. 동시 배포 전제이므로 중간 호환성 부담 없음.

### Scope B: Protocol 타입 강제

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| B1: send() 오버로드 | 호출부 수정 최소, 기존 코드에 타입만 추가 | relay 내부 변환 레이어 필요 | ❌ |
| B2: 채널별 전용 메서드 | 더 명확한 API | 기존 send() 호출부 전체 수정 (daemon 30+곳) | ❌ |
| B3: send() 오버로드 + relay 변환 레이어 | daemon/app은 즉시 적용, relay는 wire↔protocol 변환만 추가 | relay에 변환 코드 추가 | ✅ |

**선택 이유**: B3. daemon과 app은 send() 오버로드로 즉시 타입 강제. relay는 wire JSON ↔ protocol 타입 변환 레이어를 두어 내부 로직 유지. 변경 규모가 가장 작으면서 타입 안전성 달성.

## 기술 결정

### 1. CancelCompleted/CancelFailed 위치

`events.ts`에 추가하되 `AnyWDKEvent`와 별도 union으로 관리.

```typescript
// protocol/src/events.ts

export type DaemonEvent = CancelCompletedEvent | CancelFailedEvent

/** event_stream 채널에서 전달 가능한 모든 이벤트 */
export type AnyStreamEvent = AnyWDKEvent | DaemonEvent
```

근거: events.ts가 이미 모든 이벤트를 담당. 별도 파일은 관리 포인트 증가. union 분리로 "WDK 이벤트가 아님" 제약 준수.

### 2. query/query_result 타입 위치

`protocol/src/query.ts` 신규 파일.

근거: chat.ts, control.ts, events.ts가 각 채널별로 분리됨. 동일 패턴으로 별도 파일이 일관적.

### 3. RelayChannel 확장

```typescript
// Before
export type RelayChannel = 'control' | 'chat'

// After
export type RelayChannel = 'control' | 'chat' | 'event_stream' | 'query' | 'query_result'
```

### 4. event_stream top-level WS 채널 승격

event_stream을 top-level WS 채널로 승격. relay poller가 `control:{userId}` 스트림에서 sender=daemon 메시지를 읽을 때 WS `type='event_stream'`으로 변환하여 app에 전달. app에서 `message.channel === 'event_stream'`으로 직접 수신.

Redis 스트림은 기존 `control:{userId}` 공유 유지. sender 필드로 방향 구분 (현재 poller가 이미 sender로 필터링).

근거: RelayChannel DU에 `'event_stream'`이 포함되므로 wire contract과 일치. app에서 채널별 핸들링이 명확해짐. Redis 스트림 키는 변경하지 않아 복잡도 유지.

### 5. query/query_result WS 직접 전달

relay에서 `msg.type === 'query'`면 Redis XADD 건너뛰고 상대방 소켓에 직접 forward.

daemon 오프라인 시: relay가 app에 `{ requestId, status: 'error', error: 'daemon_offline' }` query_result를 평문으로 직접 응답.

**암호화 규칙**: relay가 직접 생성하는 `daemon_offline` 에러만 평문 예외. daemon이 보내는 실제 query_result(ok|error)는 기존 E2E 암호화 규칙 적용 (envelope의 encrypted 플래그). relay는 blind transport 역할 유지.

### 6. daemon send() 오버로드

```typescript
send(type: 'chat', payload: ChatEvent, userId?: string): boolean
send(type: 'event_stream', payload: EventStreamPayload, userId?: string): boolean
send(type: 'query_result', payload: QueryResult, userId?: string): boolean
send(type: string, payload: Record<string, unknown>, userId?: string): boolean
```

### 7. app query() 메서드

requestId 기반 Promise 래핑 + timeout (기본 10초).

```typescript
private pendingQueries = new Map<string, { resolve, reject }>()

async query<T>(queryType: QueryType, params: Record<string, unknown>, timeoutMs = 10000): Promise<T>
```

query_result 수신 시 onMessage에서 pendingQueries 맵 조회 → resolve/reject. 일반 messageHandler에는 전달하지 않음.

---

## 범위 / 비범위

**범위(In Scope)**:
- cancel 응답을 event_stream으로 전환 (CancelCompleted/CancelFailed)
- ControlResult 타입 제거
- relay 직접 forward 제거 (영속 채널)
- query/query_result 채널 추가 (WS 직접 전달)
- 초기 query 4종: policyList, pendingApprovals, signerList, walletList (historyList는 별도 Phase)
- daemon/relay/app에서 protocol 타입 import + send() 오버로드

**비범위(Out of Scope)**:
- app 화면에서 query 호출 연동 (Phase E) — 채널 인프라만 구축, 화면 연동은 별도 Phase
- 런타임 메시지 검증 (zod 등)
- Redis Streams 키 재설계
- CI 체크 (protocol 우회 감지)

## 가정/제약

- 동시 배포 전제. 혼합 버전 호환 불필요.
- query/query_result는 WS 직접 전달 — 영속 불필요.
- v0.4.6(Store 분리)와 병행 시 query handler에서 store/facade 직접 접근으로 우선 구현.
- `queue.consume()`이 XREAD BLOCK으로 동작 확인됨 (`redis-queue.ts:75`). 이중 전달 제거 후에도 실시간성 유지.

## 아키텍처 개요

### 채널 구조 (After)

```
App ──WS──→ Relay ──→ Redis XADD ──→ Poller XREAD ──→ Relay ──WS──→ Daemon

  chat (양방향)         chat:{userId}:{sessionId}
  control (app→daemon)  control:{userId} sender=app

Daemon ──WS──→ Relay ──→ Redis XADD ──→ Poller XREAD ──→ Relay ──WS──→ App

  chat (양방향)         chat:{userId}:{sessionId}
  event_stream          control:{userId} sender=daemon

App ──WS('query')──→ Relay ──직접 forward──→ Daemon
App ←──WS('query_result')── Relay ←──직접 forward── Daemon
  (Redis 미경유)
```

## 데이터 흐름

### cancel 처리 (Before → After)

**Before**:
```
App → control(cancel_queued) → Relay → Redis → Daemon
Daemon → control(ControlResult) → Relay → Redis → App
```

**After**:
```
App → control(cancel_queued) → Relay → Redis → Daemon
Daemon → event_stream(CancelCompleted) → Relay → Redis → App
```

### query 요청-응답

```
App                    Relay                   Daemon
 |--query(policyList)-->|                       |
 |                      |--직접 forward--------->|
 |                      |                  [facade 조회]
 |                      |<--query_result(ok)----|
 |<--직접 forward-------|                       |

 daemon 오프라인:
 |--query(policyList)-->|
 |                      | [daemon socket 없음]
 |<--query_result(err)--|
```

## API/인터페이스 계약

### protocol 변경 요약

| 파일 | 변경 |
|------|------|
| `events.ts` | +CancelCompletedEvent, +CancelFailedEvent, +DaemonEvent, +AnyStreamEvent, +EventStreamPayload (event_stream 전용) |
| `control.ts` | -ControlEvent 전체 제거 (MQ/MS/CSC → events.ts로 이동), -ControlResult 삭제 |
| `query.ts` (신규) | +QueryType, +QueryMessage DU 4종, +QueryResult (ok\|error) |
| `relay.ts` | RelayChannel: +'event_stream'\|'query'\|'query_result' |
| `index.ts` | +DaemonEvent, +AnyStreamEvent, +EventStreamPayload, +QueryType, +QueryMessage, +QueryResult export. -ControlResult export |

### 신규 타입 정의

```typescript
// protocol/src/events.ts — 추가
interface CancelCompletedEvent {
  type: 'CancelCompleted'
  cancelType: 'cancel_queued' | 'cancel_active'
  messageId: string
  wasProcessing: boolean
  timestamp: number
}

interface CancelFailedEvent {
  type: 'CancelFailed'
  cancelType: 'cancel_queued' | 'cancel_active'
  messageId: string
  reason: string
  timestamp: number
}

export type DaemonEvent = CancelCompletedEvent | CancelFailedEvent

// MessageQueuedEvent, MessageStartedEvent, CronSessionCreatedEvent는 control.ts에서 이동
// (daemon→app 알림이므로 event_stream 소속)

/** event_stream 채널에서 전달 가능한 모든 이벤트 */
export type AnyStreamEvent =
  | AnyWDKEvent
  | DaemonEvent
  | MessageQueuedEvent
  | MessageStartedEvent
  | CronSessionCreatedEvent

/** event_stream 채널 전용 payload — ControlEvent 해체 후 독립 */
export interface EventStreamPayload {
  event: AnyStreamEvent
}
```

```typescript
// protocol/src/query.ts — 신규
export type QueryType =
  | 'policyList'
  | 'pendingApprovals'
  | 'signerList'
  | 'walletList'

export type QueryMessage =
  | { type: 'policyList'; requestId: string; params: { accountIndex: number; chainId: number } }
  | { type: 'pendingApprovals'; requestId: string; params: { accountIndex: number } }
  | { type: 'signerList'; requestId: string; params: Record<string, never> }
  | { type: 'walletList'; requestId: string; params: Record<string, never> }

interface QueryResultOk {
  requestId: string
  status: 'ok'
  data: unknown
}

interface QueryResultError {
  requestId: string
  status: 'error'
  error: string
}

export type QueryResult = QueryResultOk | QueryResultError
```

### 패키지별 인터페이스 변경

**daemon/src/control-handler.ts**:
- 반환: `Promise<ControlResult | null>` → `Promise<CancelEventPayload | null>`
- cancel 처리 시 CancelCompleted/CancelFailed 이벤트 객체 반환

**daemon/src/index.ts**:
- cancel 결과를 `relayClient.send('control', result)` → `relayClient.send('event_stream', { event: result })` 로 전환
- query 수신 시 query-handler 호출 → query_result 전송

**daemon/src/query-handler.ts** (신규):
- `handleQueryMessage(msg: QueryMessage, deps): Promise<QueryResult>`
- 4종 query에 대해 facade 조회 → QueryResult 반환

**daemon/src/relay-client.ts**:
- send() 채널별 타입 오버로드

**relay/src/routes/ws.ts**:
- 영속 채널: 직접 forward 제거, Redis 단일 경로
- query/query_result: Redis bypass, WS 직접 전달
- daemon 오프라인 시 query error 응답

**app/src/core/relay/RelayClient.ts**:
- query() 메서드 + pendingQueries 맵
- query_result 수신 핸들러
- cancel 결과 수신을 event_stream에서 CancelCompleted/CancelFailed로 변경

## 테스트 전략

| 대상 | 레벨 | 범위 |
|------|------|------|
| control-handler cancel→CancelEventPayload | unit | 기존 cancel 테스트 수정. ControlResult 대신 CancelEventPayload 반환 확인 |
| query-handler 4종 | unit | 각 QueryType별 정상/에러 응답 확인 |
| relay 직접 forward 제거 | integration | poller만으로 메시지 전달 확인 |
| relay query 라우팅 | integration | query→daemon, query_result→app 직접 전달 확인 + daemon 오프라인 에러 |
| tsc --noEmit | compile | protocol 타입 변경 후 모든 패키지 컴파일 통과 확인 |

## Phase별 파일 변경 매트릭스

| Phase | 파일 | 변경 |
|-------|------|------|
| **A: cancel→event_stream** | protocol/events.ts | +DaemonEvent, +AnyStreamEvent, +EventStreamPayload |
| | protocol/control.ts | -EventStreamEvent (ControlEvent에서 제거) |
| | protocol/index.ts | +export |
| | daemon/control-handler.ts | cancel→CancelEventPayload |
| | daemon/index.ts | event_stream으로 전송 |
| | app ChatDetailScreen.tsx | cancel 수신을 event_stream에서 |
| **B: ControlResult 제거** | protocol/control.ts | -ControlResult |
| | protocol/index.ts | -ControlResult export |
| | daemon/control-handler.ts | -ControlResult import |
| | daemon/tests/control-handler.test.ts | assertion 수정 |
| **C: 이중 전달 제거** | relay/ws.ts | 직접 forward 코드 삭제 |
| **D: query 채널** | protocol/query.ts (신규) | 전체 |
| | protocol/relay.ts | RelayChannel 확장 |
| | protocol/index.ts | +query export |
| | relay/ws.ts | query/query_result 라우팅 |
| | daemon/query-handler.ts (신규) | 전체 |
| | daemon/ports.ts | +QueryFacadePort |
| | daemon/index.ts | query handler 연결 |
| | app/RelayClient.ts | query() + pendingQueries |
| **E: 타입 강제** | daemon/relay-client.ts | send() 오버로드 |
| | daemon/chat-handler.ts | ChatEvent import + 적용 |
| | daemon/index.ts | AnyStreamEvent 적용 |
| | relay/ws.ts | protocol 기반 타입 강화 |
| | app/RelayClient.ts | protocol 타입 적용 |

## 리스크/오픈 이슈

1. **poller 실시간성**: 검증 완료 — `redis-queue.ts:75`에서 `XREAD BLOCK`을 사용. 이중 전달 제거 후에도 실시간성 유지됨.
2. **relay poller의 event_stream 변환**: relay poller가 `control:{userId}` 스트림에서 sender=daemon 메시지를 읽을 때 WS `type`을 `'control'`이 아닌 `'event_stream'`으로 변환해야 함. pollControlForApp() 수정 필요. 현재 모든 메시지를 `type: 'control'`로 내보내는 로직을 payload 내부 type을 확인하여 분기.
