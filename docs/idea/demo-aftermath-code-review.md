# 작업위임서 — 데모 후 코드 정리 (Anti-pattern / Spaghetti 해소)

> 데모 급조 코드에서 14개 안티패턴/기술부채 발견. P0 2건 즉시 수정, P1 4건 별도 Phase, P2/P3 8건 중장기 정리.

---

## 6하원칙

### Who (누가)
- 다음 세션 / Claude Code agent
- 필요 권한: 파일 시스템 읽기/쓰기, MCP (Codex 리뷰 선택적)

### What (무엇을)

#### Quick Fix (즉시, 2커밋)

**커밋 1: `fix(daemon-relay): remove sensitive/noisy logs and simplify bootstrap`**
- [ ] `packages/daemon/src/index.ts:114` — 사용자 프롬프트 원문 info 로그 제거
- [ ] `packages/relay/src/routes/ws.ts` — DEBUG info 로그 6개 제거/debug 하향
  - L372: `App WS message received` → 제거 (위치/주석 불일치)
  - L402: `Chat forward attempt` → 제거 (실패 로그만 남기면 충분)
  - L407: `Chat forwarded to daemon` → 제거
  - L409/412: warn 로그는 유지 (daemon 미매핑 진단용)
  - L546: `pollChatForApp started` → debug로 하향 (유일하게 남길 가치)
  - L561: `pollChatForApp delivering message` → 제거 (hot-path 로그)
- [ ] `packages/daemon/src/index.ts:179-212` — bootstrap retry loop 정리
  - Phase 1: `authenticateWithRelay()` — 이것만 retry (현재 10회/3초)
  - Phase 2: enrollment code 요청 — best effort, 별도 함수
  - Phase 3: `relayClient.connect()` — fire-and-forget, 내부 reconnect에 위임
- [ ] `packages/daemon/src/chat-handler.ts` — DI 정리
  - 모듈 레벨 `pino` 인스턴스 제거, logger를 deps에서 DI로 받도록 복원
  - `_ctx: unknown`, `_opts: ChatHandlerOptions` 파라미터 제거
  - `ChatHandlerOptions.maxIterations` dead interface 제거
  - 에러 로깅에서 `err.message`만이 아닌 err 객체 직접 전달 (stack 보존)

**커밋 2: `fix(chat-flow): stabilize queued-started ordering and send/cancel UX`**
- [ ] `packages/daemon/src/message-queue.ts` — `enqueue()` 내 `_drain()` 호출을 `queueMicrotask`로 defer
  - 목적: `message_queued`가 `message_started`보다 먼저 나가도록 보장
- [ ] `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx`
  - `onSubmitEditing`에 `isLoading` 가드 추가
  - `message_started` 수신 시 `messageId`도 같이 반영하도록 방어 코드
  - cancel 버튼: `queuedMessageId` 없을 때 사용자에게 피드백 제공

#### Phase 작업 (별도 진행)

**Phase A: App Chat Runtime Session Scope (v0.5.8)**
- [ ] `useChatStore`의 `isLoading/isTyping/queuedMessageId/messageState` → `sessionRuntime: Record<string, SessionRuntime>` map으로 전환
- [ ] `ChatDetailScreen`의 `streamBufferRef/streamMsgIdRef` → store의 sessionRuntime으로 이동
- [ ] `done` 핸들러의 세션 오판 제거

**Phase B: Daemon Re-auth on Reconnect**
- [ ] daemon `RelayClient._scheduleReconnect()`에서 reconnect 전 `authenticateWithRelay()` 재호출
- [ ] refresh token 활용 또는 daemonId/secret 재로그인 방식 선택

**Phase C: Relay Chat Delivery Architecture**
- [ ] app→daemon `chat` direct forward 제거
- [ ] `daemon-chat:{daemonId}` 단일 inbox stream 도입
- [ ] daemon이 해당 stream을 poll하도록 변경
- [ ] `subscribe_chat/user_bound` poller dedupe 추가

**Phase D: Relay Route Decomposition & Ops Hardening**
- [ ] `ws.ts` 644줄 → `ws/state.ts`, `ws/daemon-connection.ts`, `ws/app-connection.ts`, `ws/pollers/`, `ws/push.ts`로 분리
- [ ] poller retry에 exponential backoff + circuit breaker 추가
- [ ] Redis chat stream key lifecycle (TTL/archive) 정책 추가

### When (언제)
- Quick Fix: 즉시 가능 (선행 조건 없음)
- Phase A: v0.5.8로 이미 CLAUDE.md에 등록됨
- Phase B/C/D: Phase A 이후 순서대로

### Where (어디서)
| 패키지 | 파일 | 변경 유형 |
|--------|------|----------|
| daemon | `src/index.ts` | 로그 제거, bootstrap 분리 |
| daemon | `src/chat-handler.ts` | DI 복원, dead code 제거 |
| daemon | `src/message-queue.ts` | _drain() defer |
| relay | `src/routes/ws.ts` | DEBUG 로그 제거, (Phase C/D에서 구조 분리) |
| app | `src/domains/chat/screens/ChatDetailScreen.tsx` | UX 보정, (Phase A에서 구조 변경) |
| app | `src/stores/useChatStore.ts` | (Phase A에서 sessionRuntime 추가) |
| app | `src/core/relay/RelayClient.ts` | (Phase B에서 재인증 추가) |

### Why (왜)
데모를 위해 급조된 코드가 다음 문제를 야기:
1. **보안**: 사용자 프롬프트 원문이 info 로그에 노출
2. **정합성**: 이벤트 순서 역전으로 cancel UX 불일치
3. **멀티세션**: 글로벌 state로 세션 간 오염/메시지 유실
4. **장기 운영**: JWT 만료 후 daemon 영구 단절
5. **아키텍처**: v0.4.8 Redis SSOT 원칙 위반 (chat direct forward)

안 고치면: 프로덕션에서 민감정보 유출, 멀티세션 메시지 유실, 7일 후 daemon 단절 발생.

### How (어떻게)
- Quick Fix: 직접 구현 (2커밋)
- Phase A: `/phase-workflow` v0.5.8 (이미 등록)
- Phase B/C/D: `/phase-workflow` 또는 `/quick-phase-workflow`

---

## 맥락

### 현재 상태
- 브랜치: `master`
- 미커밋 변경: 7개 파일 (데모 코드 포함)
- 최근 커밋: `5cbce49` (v0.5.7 Manifest DeFi Tools)

### Codex 토론 결과 (세션 /Users/mousebook/Documents/GitHub/WDK-APP/12)
- 11회 토론, 14개 이슈 식별
- Codex 동의: 전 항목
- Codex 추가 발견:
  - daemon `RelayClient.connect()`가 fire-and-forget → retry loop의 WS 검증이 무의미
  - `message_started`가 `message_queued`보다 먼저 도착하는 root cause: `_drain()` 동기 시작
  - `user_bound` 중복 시 이전 poller abort 미정리
  - Redis chat stream key cardinality 무한 증가

### 사용자 확정 결정사항
- 민감정보 로그: 제거 (C안 채택, chat-handler에 이미 안전한 관측 포인트 있음)
- message ordering fix: _drain() defer 방식 (A안 채택)
- 세션별 state: `SessionRuntime` map 통합 방식 (v0.5.8)
- Quick Fix는 2커밋 분리 (daemon-relay / chat-flow)

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| CLAUDE.md | `/CLAUDE.md` | 아키텍처 원칙, 채널 방향성 |
| v0.5.8 Phase | `docs/phases/v0.5.8-session-loading-isolation/` | 세션별 state 분리 |
| v0.5.0 Phase | `docs/phases/v0.5.0-chat-poller/` | Chat Poller 구현 |

---

## 주의사항
- `chat-handler.ts`의 `_ctx/opts` 제거 시 호출부(`index.ts:77`, `index.ts:115`)도 함께 정리
- `_drain()` defer는 cron enqueue 경로도 동일하게 적용됨 — cron 동작 확인 필요
- relay DEBUG 로그 중 L409/412 warn은 유지 (daemon 미매핑 진단용)
- `ws.ts` 분리는 Phase D까지 미루되, 그 전에 로그만 정리

## 시작 방법
```bash
# Quick Fix부터 시작
# 커밋 1: daemon-relay 로그/bootstrap 정리
# 대상 파일을 읽고 위 체크리스트 순서대로 수정

# 커밋 2: chat-flow 이벤트 순서/UX 보정
# message-queue.ts의 _drain() defer 먼저, 이후 ChatDetailScreen 보정
```
