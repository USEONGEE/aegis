# Chat Poller 구현 - v0.5.0

## 문제 정의

### 현상
- App에서 AI에게 채팅 메시지를 보내면 "AI is thinking..." 상태에서 영원히 멈춤
- Daemon에 chat 메시지가 전달되지 않아 OpenClaw 호출이 발생하지 않음
- Daemon이 응답을 보내더라도 App에 전달되지 않음

### 원인
v0.4.8에서 WebSocket 직접 forward를 제거하고 "Redis Stream → Poller" 방식으로 전환했으나, **Chat 채널의 Poller를 양방향 모두 구현하지 않았다.**

현재 상태:

| 채널 | App→Daemon | Daemon→App | 상태 |
|------|-----------|-----------|------|
| Control | Redis → `pollControlForDaemon()` | Redis → `pollControlForApp()` | ✅ 작동 |
| Query | WS 직접 전달 | WS 직접 전달 | ✅ 작동 |
| **Chat** | Redis에 저장만 됨 | Redis에 저장만 됨 | ❌ **양방향 누락** |

- App이 chat을 보내면 Redis `chat:{userId}:{sessionId}` 스트림에 저장되지만, Daemon이 이를 polling하지 않음
- Daemon이 chat 응답을 보내면 같은 스트림에 저장되지만, App이 이를 polling하지 않음
- `backfillChatStream()`은 연결 시 일회성 XRANGE일 뿐, 지속적 polling이 아님

### 영향
- **채팅 기능 완전 불능**: App ↔ Daemon 간 실시간 채팅이 불가
- **핵심 기능 차단**: AI 대화가 WDK-APP의 주요 기능이므로 사실상 앱 사용 불가

### 목표
- Chat 채널에 양방향 Redis Stream Poller를 구현하여 실시간 채팅 복원
- Control Poller와 동일한 패턴으로 일관성 유지

### 비목표 (Out of Scope)
- Chat Poller 이외의 기능 추가
- 기존 Control/Query 채널 변경
- App UI 수정
- Daemon chat-handler 로직 변경

## 제약사항
- v0.4.8 아키텍처 원칙 유지: "Redis → Poller가 유일한 전달 경로"
- 기존 `pollControlForDaemon()`, `pollControlForApp()` 패턴과 동일한 구조 사용
- `packages/relay/src/routes/ws.ts` 내 구현
