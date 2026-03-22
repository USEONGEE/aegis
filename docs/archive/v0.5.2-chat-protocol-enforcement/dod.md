# DoD (Definition of Done) - v0.5.2

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `sendChat()` 시그니처가 `(sessionId: string, text: string)` | 코드 확인 |
| F2 | 내부에서 `{ userId, sessionId, text }`를 `RelayChatInput`으로 조립하여 전송 | 코드 확인 |
| F3 | 3개 call site 모두 `sendChat(sessionId, text)` 형태로 호출 | grep 확인 |
| F4 | App에서 채팅 전송 → Daemon이 정상 수신 | Docker logs 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | `unknown` 타입이 sendChat payload에 남아있지 않음 | 코드 확인 |
| N2 | 이 Phase의 변경으로 인한 신규 타입 에러 없음 | 변경 파일에 대해 `npx tsc --noEmit` 에러 비교 (기존 baseline 대비) |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 잘못된 타입으로 sendChat 호출 시 (예: 객체 전달) | 컴파일 에러 | 수동 확인: `sendChat(id, { content: 'x' })` 작성 시 IDE 에러 |
