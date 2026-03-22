# 작업위임서 — WS 채널 재설계 (단방향 통일 + 중복 제거 + query 채널 추가)

> control/event_stream 단방향 통일, relay 이중 전달 제거, query/query_result 채널 신설로 app↔daemon 통신 체계 정비

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: `packages/relay`, `packages/daemon`, `packages/app`, `packages/protocol`

### What (무엇을)

**Phase A: cancel 응답을 event_stream으로 전환**
- [ ] daemon의 `control-handler.ts`에서 cancel_queued/cancel_active의 ControlResult 반환을 제거
- [ ] cancel 결과를 daemon 자체 이벤트로 정의 (예: `CancelCompleted`, `CancelFailed`)
- [ ] daemon의 `index.ts`에서 cancel 이벤트를 relay로 `event_stream` 타입으로 전송
- [ ] app의 cancel 결과 수신을 `control` 응답 대기에서 `event_stream` 구독으로 전환

**Phase B: control을 app→daemon 단방향으로 정리**
- [ ] relay의 `ws.ts`에서 daemon→app 방향 control 메시지 전송 경로가 없는지 확인
- [ ] `handleControlMessage()`의 반환 타입을 `ControlResult | null` → `null`로 변경 (항상 null 반환)
- [ ] `ControlResult` 타입 제거 또는 protocol에서 삭제

**Phase C: relay 이중 전달 경로 제거**
- [ ] `ws.ts`에서 메시지 수신 시 상대방 소켓에 직접 forward하는 코드 제거
- [ ] Redis XADD + poller XREAD를 유일한 전달 경로로 통일
- [ ] 중복 수신 불가능 확인

**Phase D: query/query_result 채널 추가**
- [ ] protocol에 `query`/`query_result` 메시지 타입 정의
- [ ] query 종류 정의 (최소 MVP):

| query 타입 | 반환 데이터 | 용도 |
|-----------|-----------|------|
| `policyList` | StoredPolicy[] | 정책 목록 화면 |
| `policyVersions` | PolicyVersionEntry[] | 정책 변경 이력 |
| `pendingApprovals` | PendingApprovalRequest[] | 대기 중 승인 목록 |
| `signerList` | StoredSigner[] | 서명자 관리 화면 |
| `walletList` | StoredWallet[] | 지갑 목록 화면 |
| `historyList` | HistoryEntry[] | 승인 이력 화면 |
| `rejectionList` | RejectionEntry[] | 거부 이력 화면 |
| `journalList` | StoredJournal[] | tx 실행 현황 화면 |

- [ ] daemon에 query handler 추가 — query 수신 → store/facade 조회 → query_result 전송
- [ ] relay에서 `query`/`query_result` 타입 라우팅 추가 (app→daemon, daemon→app)
- [ ] relay에서 query/query_result용 Redis 스트림 키 결정
- [ ] app에서 query 요청 유틸 구현 — requestId 기반 Promise 래핑

**Phase E: app 화면에서 query 활용**
- [ ] PolicyScreen — 화면 진입 시 `policyList` query → 표시
- [ ] ApprovalScreen — 화면 진입 시 `pendingApprovals` query → 표시
- [ ] ActivityScreen — 화면 진입 시 `historyList` + `journalList` query → 표시
- [ ] SettingsScreen — 화면 진입 시 `signerList` + `walletList` query → 표시
- [ ] 정책 수정/삭제 — control로 승인 요청 (기존 플로우)

### When (언제)
- 선행 조건: v0.4.4 완료 후 (app 이벤트 마이그레이션 먼저)
- Phase A~C와 Phase D~E는 독립적으로 병렬 가능
- 기한 없음

### Where (어디서)

| 파일 | 변경 내용 |
|------|----------|
| `packages/protocol/src/` | CancelCompleted/CancelFailed 이벤트, query/query_result 메시지 타입, ControlResult 제거 |
| `packages/daemon/src/control-handler.ts` | cancel ControlResult 반환 제거 |
| `packages/daemon/src/index.ts` | cancel 이벤트 event_stream 전송 |
| `packages/daemon/src/query-handler.ts` (신규) | query 수신 → store/facade 조회 → query_result 전송 |
| `packages/relay/src/routes/ws.ts` | 직접 forward 제거, query/query_result 라우팅 추가 |
| `packages/app/src/core/relay/RelayClient.ts` | cancel을 event_stream에서 수신, query 요청 유틸 추가 |
| `packages/app/src/domains/*/screens/*.tsx` | 화면 진입 시 query 호출 |
| `packages/app/src/stores/usePolicyStore.ts` | query 결과로 store 갱신 |

### Why (왜)

**문제 1: 채널 방향 비일관성**

현재 control이 양방향으로 사용됨. 승인 결과는 event_stream, cancel 결과는 control — app에서 2곳을 봐야 한다.

**문제 2: 메시지 중복 수신**

relay가 직접 forward + Redis polling 이중 경로 — 같은 메시지를 2번 받을 수 있다. dedup 로직 없음.

**문제 3: 데이터 조회 경로 부재**

app에서 정책 목록, tx 이력, 서명자 목록 등을 조회하려면 AI에게 채팅으로 물어봐야 한다. 전용 조회 채널이 없어서:
- 정책 화면에 데이터를 표시할 수 없음
- tx 실행 현황/통계를 볼 수 없음
- 서명자/지갑 관리 화면이 빈 상태
- usePolicyStore 등 store에 setter만 있고 fetch 로직 없음

통일 후 최종 채널 구조:

| 타입 | 방향 | 용도 |
|------|------|------|
| `chat` | 양방향 | AI 대화 (typing, stream, tool_start, tool_done, done) |
| `control` | app → daemon 단방향 | 승인 6종 + 취소 2종 (요청만) |
| `event_stream` | daemon → app 단방향 | WDK 이벤트 14종 + cancel 결과 (알림) |
| `query` | app → daemon 단방향 | 데이터 조회 요청 |
| `query_result` | daemon → app 단방향 | 조회 응답 |

### How (어떻게)

**cancel 이벤트 정의 예시:**
```ts
// protocol/src/events.ts에 추가
export interface CancelCompleted {
  type: 'CancelCompleted'
  messageId: string
  wasProcessing: boolean
  timestamp: number
}

export interface CancelFailed {
  type: 'CancelFailed'
  messageId: string
  reason: string
  timestamp: number
}
```

**relay 직접 forward 제거 예시:**
```ts
// Before: ws.ts에서 메시지 수신 시
queue.publish(streamKey, msg)        // Redis 영속
daemonSocket.send(msg)               // 직접 forward (제거 대상)

// After:
queue.publish(streamKey, msg)        // Redis 영속만. poller가 전달.
```

**query/query_result 프로토콜 예시:**
```ts
// app → daemon
{
  type: 'query',
  requestId: 'uuid-1234',
  query: 'policyList',
  params: { accountIndex: 0, chainId: 1 }
}

// daemon → app
{
  type: 'query_result',
  requestId: 'uuid-1234',
  status: 'ok',
  data: [ ...StoredPolicy[] ]
}
```

**app에서 query 사용 패턴:**
```ts
// RelayClient에 추가
async query<T>(queryType: string, params: Record<string, unknown>): Promise<T> {
  const requestId = randomUUID()
  this.send('query', { requestId, query: queryType, params })
  return this.waitForQueryResult<T>(requestId, timeout)
}

// 화면에서 사용
const policies = await relayClient.query<StoredPolicy[]>('policyList', { accountIndex: 0 })
usePolicyStore.getState().setActivePolicies(policies)
```

**event_stream은 알림 용도, query는 데이터 조회 용도:**
```
event_stream: "PolicyApplied 됐어" → toast 알림 + 배지 갱신
query: 정책 화면 진입 → policyList 요청 → 최신 데이터 표시
```

동기화 상태를 관리할 필요 없음. 화면 진입 시마다 query로 최신 데이터를 가져옴. 네트워크 끊김/복구 후에도 화면 재진입하면 자동으로 최신.

워크플로우: `/phase-workflow` 또는 `/codex-phase-workflow`

---

## 맥락

### 통신 구조 前提知識

App과 Daemon은 直接 연결되지 않는다. Relay 서버가 중간에서 양쪽과 WS로 연결하고, 내부에서 Redis Streams로 메시지를 영속한다. App/Daemon은 Redis의 존재를 모른다.

```
App ──WS──→ Relay ──→ Redis XADD ──→ Poller XREAD ──→ Relay ──WS──→ Daemon
App ←──WS── Relay ←── Redis XADD ←── Poller XREAD ←── Relay ←──WS── Daemon
```

현재 WS 메시지는 `type` 필드로 논리적으로 구분된다:

| 타입 | 현재 방향 | Redis 스트림 키 | 용도 |
|------|----------|----------------|------|
| `chat` | 양방향 | `chat:{userId}:{sessionId}` | AI 대화 (typing, stream, tool_start, tool_done, done) |
| `control` | **양방향** (문제) | `control:{userId}` | 승인/취소 요청 + cancel 응답 |
| `event_stream` | daemon → app | `control:{userId}` | WDK 이벤트 14종 |

### 이중 전달이 생긴 이유

relay가 메시지를 받으면 2가지를 동시에 한다:
1. **Redis XADD** — 메시지 영속 (오프라인 시 복구용)
2. **상대방 소켓에 직접 forward** — 실시간 전달

이 구조는 "온라인이면 즉시 전달, 오프라인이면 나중에 복구"를 위해 설계됐지만, 온라인 상태에서 Redis poller도 동시에 돌고 있어서 **같은 메시지가 2번 도착**할 수 있다. 현재 dedup 로직 없음.

### control이 양방향이 된 경위

v0.4.2 이전: 모든 승인/취소의 결과를 `control` 타입 `ControlResult`로 daemon→app에 직접 응답.
v0.4.2에서: 승인 6종의 결과를 WDK 이벤트(`event_stream`)로 전환. 이유: 이중 시그널 문제 (ControlResult + WDK 이벤트가 동시에 가서 app이 2번 처리).
결과: cancel 2종만 `control`로 직접 응답이 남아서 control이 양방향이 됨. app에서 결과를 받으려면 event_stream과 control 두 곳을 봐야 하는 비일관성 발생.

### 데이터 조회 경로가 없는 이유

현재 app→daemon 통신은 `chat`(AI 대화)과 `control`(승인/취소)만 있다. 정책 목록, tx 이력, 서명자 목록 등 데이터를 직접 조회하는 채널이 없어서 AI에게 채팅으로 "정책 보여줘"라고 물어봐야 한다. app의 store(usePolicyStore 등)에 setter만 있고 fetch 로직이 없는 것이 증거.

### event_stream과 query의 역할 구분

둘 다 daemon→app으로 데이터를 전달하지만 목적이 다르다:
- **event_stream** = 알림. "PolicyApplied 됐어" → toast 띄우기, 배지 갱신. 화면을 보고 있든 아니든 수신.
- **query** = 데이터 조회. 정책 화면 진입 → "지금 정책 목록 줘" → 최신 데이터 표시. 화면이 필요할 때만 요청.

연결 시 전체 동기화 방식(push)은 채택하지 않음. 이유: 네트워크 끊김 시 그 사이 이벤트를 놓치면 공백이 생기고, 이를 해결하려면 reconnect 시 다시 전체 동기화하거나 cursor 기반 replay가 필요해서 복잡도가 증가. query로 화면 진입 시마다 최신을 가져오면 동기화 상태 관리가 불필요.

### 현재 수치
- control 메시지 8종 중 6종(승인)은 event_stream으로 결과 전달, 2종(cancel)만 control로 직접 응답
- relay에서 메시지 이중 전달 (직접 forward + Redis polling) — dedup 없음
- app에서 daemon 데이터 조회 경로 없음 — AI 채팅으로만 가능
- usePolicyStore, useApprovalStore 등에 setter만 있고 fetch 로직 없음

### 사용자 확정 결정사항
- control은 app→daemon 단방향으로 통일
- event_stream은 daemon→app 단방향으로 통일 — **알림 용도** (화면 toast, 배지 갱신)
- cancel 결과를 event_stream으로 전환 (CancelCompleted/CancelFailed 이벤트)
- relay 내부에서 직접 forward 제거, Redis XADD → poller XREAD 단일 경로로 통일
- query/query_result 채널 신설 — **데이터 조회 용도** (화면 진입 시 최신 데이터 fetch)
- 연결 시 전체 동기화 방식은 채택하지 않음 — 네트워크 끊김 시 공백 문제가 생기고 복잡도 증가. query로 화면 진입 시마다 최신 데이터를 가져오는 게 단순

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| relay 아키텍처 | `docs/report/relay-domain-aggregate-analysis.md` | Socket/Queue 도메인, 메시지 중계 축 |
| daemon 아키텍처 | `docs/report/daemon-architecture-one-pager.md` | 제어 채널 축, 통신 채널 전체 맵 |
| v0.4.2 Phase | `docs/archive/v0.4.2-wdk-event-unification/` | ControlResult 제거 경위 |
| v0.4.4 Phase | `docs/phases/v0.4.4-app-wdk-event-migration/` | app event_stream 전환 |
| store 분리 | `docs/handover/store-separation.md` | query handler가 접근할 store 구조 |

---

## 주의사항
- XREAD BLOCK으로 전환 시, poller가 이미 돌고 있는 상태인지 확인. 현재 온라인 + poller 동시 동작이 전제
- cancel 이벤트는 WDK 이벤트가 아님 — daemon 자체 이벤트. `AnyWDKEvent` union에 포함하지 말고 별도 union 또는 상위 union으로 관리
- relay의 pushToOfflineApps()는 직접 forward와 무관 — Redis XADD 후에 호출하므로 영향 없음
- query/query_result는 영속 필요 없을 수 있음 — Redis에 저장하지 않고 WS 직접 전달도 검토 (조회는 재연결 시 replay할 필요 없으므로)
- store 분리(`docs/handover/store-separation.md`)가 먼저 완료되면 query handler가 WDK facade + DaemonStore로 깔끔하게 분리됨. 동시 진행 시 store 직접 접근으로 우선 구현 후 리팩토링
- Phase A~C(채널 정리)와 Phase D~E(query 추가)는 독립적이므로 병렬 가능

## 시작 방법
```
/phase-workflow 또는 /codex-phase-workflow

Phase 이름: WS 채널 재설계
- Phase A~C: 채널 단방향 통일 + 중복 제거 (relay + daemon + app)
- Phase D~E: query 채널 추가 + app 화면 연동 (daemon + app)
병렬 가능. A~C 먼저 시작 권장.
```
