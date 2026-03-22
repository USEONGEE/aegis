# DoD (Definition of Done) - v0.5.3

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | Daemon이 Anthropic API를 직접 호출하여 응답 수신 | Docker logs에 AI 응답 로그 확인 |
| F2 | streaming delta가 App에 전달됨 | App UI에서 글자가 하나씩 나타나는지 확인 |
| F3 | `OpenClawClient` 인터페이스 변경 없음 | 코드 확인 — `chat()`, `chatStream()` 시그니처 유지 |
| F4 | tool_calls가 정상 동작 | Daemon 로그에서 tool call 처리 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | ANTHROPIC_API_KEY가 .env에서 daemon 컨테이너로 전달됨 | docker-compose.yml 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | API 키 없을 때 | 에러 로그 출력, 크래시 안 함 | 환경변수 미설정 후 daemon 시작 확인 |
