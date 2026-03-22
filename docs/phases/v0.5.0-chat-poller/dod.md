# DoD (Definition of Done) - v0.5.0

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | App에서 chat 메시지 전송 시 Daemon이 수신하여 OpenClaw 호출이 실행됨 | Docker logs에 daemon의 chat handler 진입 로그 확인 |
| F2 | Daemon이 OpenClaw 응답(stream/done/error)을 보내면 App에 실시간 전달됨 | App UI에서 AI 응답 텍스트가 표시되는지 확인 |
| F3 | App→Daemon chat 전달 시 Redis Stream에도 저장됨 (이력 보존) | `docker exec redis redis-cli XRANGE chat:* - +` 로 엔트리 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 기존 Control/Query 채널 동작에 영향 없음 | App에서 정책 조회(query) 정상 동작 확인 |
| N2 | echo 방지: App이 보낸 메시지가 App에 다시 전달되지 않음 | App UI에 중복 메시지 없음 확인 |
| N3 | echo 방지: Daemon이 보낸 메시지가 Daemon에 다시 전달되지 않음 | Daemon 로그에 자기 메시지 재수신 없음 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | App이 subscribe_chat 전에 Daemon이 응답을 보낸 경우 | subscribe_chat 시 backfill로 누락 메시지 수신 | 메시지 순서 확인 |
| E2 | App WebSocket 재연결 시 | 새 subscribe_chat으로 polling 재개, 이전 poller 정리 | disconnect→reconnect 후 채팅 정상 동작 확인 |
| E3 | Daemon 재시작 시 | 새 연결에서 chat forward 정상 동작 | daemon 재시작 후 채팅 전송 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| Chat 양방향 Poller 구현으로 실시간 채팅 복원 | F1, F2 | ✅ |
| Control Poller와 동일한 패턴으로 일관성 유지 | 설계에서 패턴 준수 확인 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| App→Daemon: Redis 저장 + 직접 forward | F1, F3 | ✅ |
| Daemon→App: pollChatForApp() | F2 | ✅ |
| echo 방지 (sender 필터링) | N2, N3 | ✅ |
