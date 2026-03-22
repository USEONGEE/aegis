# Chat Protocol 타입 강제 적용 - v0.5.2

## 문제 정의

### 현상
- App의 `RelayClient.sendChat()`이 `unknown` 타입으로 payload를 받아, 화면마다 서로 다른 비프로토콜 형식으로 전송
  - ChatDetailScreen: `{ text }`
  - DashboardScreen: `{ role, content }`
  - SettingsScreen: `{ role, content }`
- Daemon은 `RelayChatInput { userId, sessionId, text }`를 기대하므로 런타임에 "Malformed chat message" 에러 발생

### 원인
`@wdk-app/protocol`에 `RelayChatInput` 타입이 정의되어 있지만, App의 `RelayClient.sendChat()` 메서드가 payload를 `unknown`으로 받아서 컴파일 타임에 필드 불일치를 잡지 못함.

### 영향
- 컴파일 통과 → 런타임 에러 → 디버깅 난이도 높음
- 화면별로 다른 형식이 퍼져 있어 일관성 없음

### 목표
- `sendChat()`의 payload 타입을 `unknown` → 구체적 타입으로 변경
- 호출자는 `text`만 전달, `RelayClient`가 `userId/sessionId`를 내부 보강
- 모든 call site가 동일한 타입으로 통일

### API Contract 결정
```typescript
// Before: 타입 없음
async sendChat(sessionId: string, payload: unknown): Promise<void>

// After: text만 받음, RelayClient가 userId/sessionId 보강
async sendChat(sessionId: string, text: string): Promise<void>
```
내부 구현: `RelayClient.sendChat()` 안에서 `const input: RelayChatInput = { userId: this.userId, sessionId, text }`를 조립하여 protocol 타입으로 전송한다.

### 비목표 (Out of Scope)
- Protocol 타입 자체의 구조 변경
- Daemon/Relay 측 타입 수정 (App 송신 방향만)
- App의 inbound chat 처리 (수신 방향 — `ChatEvent`와 `role` 불일치는 별도 Phase)
- v0.5.0 Chat Poller 구현

## 제약사항
- `@wdk-app/protocol` 기존 타입 구조 유지
- App 패키지만 수정
