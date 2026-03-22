# 설계 - v0.5.0

## 변경 규모
**규모**: 작은 변경
**근거**: 단일 파일(`ws.ts`) 내 수정, 기존 `pollControlForDaemon()` / `pollControlForApp()` 패턴을 그대로 적용

---

## 문제 요약
v0.4.8에서 Chat 채널의 WS 직접 forward를 제거하고 Redis Poller 방식으로 전환했으나, Chat용 Poller를 양방향 모두 구현하지 않아 채팅이 완전히 불능 상태.

> 상세: [README.md](README.md) 참조

## 접근법

기존 Control Poller 패턴을 Chat에 동일하게 적용한다.

### App→Daemon: `pollChatForDaemon()`
- Daemon 인증 시 바인딩된 각 userId에 대해 chat stream polling 시작
- **문제**: chat stream 키가 `chat:{userId}:{sessionId}`여서 sessionId를 미리 알 수 없음
- **해결**: App이 chat 메시지를 보내면 Relay가 Redis에 저장 후, daemon의 WebSocket으로 **직접 forward**한다. Chat은 즉시성이 중요하고, App→Daemon 방향은 항상 daemon이 연결된 상태에서만 의미가 있으므로 polling이 아닌 직접 전달이 적합하다.

### Daemon→App: `pollChatForApp()`
- App이 `subscribe_chat` 메시지로 세션을 구독하면, 해당 세션의 chat stream을 지속적으로 polling
- 기존 `backfillChatStream()`은 일회성 XRANGE → 지속적 polling으로 전환
- sender=app 필터링 (echo 방지)

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 양방향 모두 Poller | 아키텍처 일관성 | Chat은 sessionId 기반이라 polling 대상을 미리 알 수 없음 (App→Daemon) | ❌ |
| B: App→Daemon 직접전달 + Daemon→App Poller | 즉시성 + 실용적 | v0.4.8 원칙에서 약간 벗어남 | ✅ |
| C: 양방향 모두 직접전달 (v0.4.8 이전 복원) | 단순 | v0.4.8 아키텍처 원칙 위반 | ❌ |

**선택 이유**: App→Daemon은 sessionId를 미리 알 수 없어 polling이 비효율적. 반면 Daemon→App은 App이 `subscribe_chat`으로 세션을 명시적으로 구독하므로 polling이 자연스럽다. Control 채널도 직접전달을 하지 않고 Redis Poller를 쓰는 이유는 연결 끊김 시 메시지 유실 방지인데, App→Daemon chat은 daemon이 반드시 연결된 상태에서만 전달되므로 직접전달이 적합.

## 기술 결정

### 1. App→Daemon Chat 전달
- `ws.ts` App 메시지 핸들러에서 chat 메시지 수신 시:
  1. Redis Stream에 저장 (기존 유지 — 이력 보존)
  2. Daemon WebSocket으로 직접 forward 추가

### 2. Daemon→App Chat 전달: `pollChatForApp()` 추가
- `subscribe_chat` 핸들러에서 backfill 후 지속적 polling 시작
- `pollControlForApp()` 패턴 그대로 따름
- AbortController로 연결 해제 시 polling 중단

### 3. 변경 파일
- `packages/relay/src/routes/ws.ts` — 단일 파일

## 테스트 전략
- Docker compose로 전체 스택 실행 후 App에서 채팅 전송 → 응답 수신 확인 (수동 E2E)
