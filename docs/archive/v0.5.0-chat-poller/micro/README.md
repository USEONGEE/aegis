# v0.5.0 Chat Poller — 티켓 현황

## 티켓 목록

| Step | 이름 | 의존성 | DoD 매핑 |
|------|------|--------|---------|
| 01 | App→Daemon chat 직접 전달 | 없음 | F1, F3, N1 |
| 02 | Daemon→App chat poller | 없음 | F2, N2, N3, E1, E2, E3 |

## 커버리지 매트릭스

| DoD | Step | 커버 |
|-----|------|------|
| F1: App→Daemon chat 전달 | 01 | ✅ |
| F2: Daemon→App 응답 전달 | 02 | ✅ |
| F3: Redis 이력 보존 | 01 | ✅ |
| N1: Control/Query 영향 없음 | 01, 02 | ✅ |
| N2: App echo 방지 | 02 | ✅ |
| N3: Daemon echo 방지 | 01 | ✅ |
| E1: subscribe 전 응답 backfill | 02 | ✅ |
| E2: App 재연결 | 02 | ✅ |
| E3: Daemon 재시작 | 01 | ✅ |
