# Daemon AI 클라이언트 — Anthropic 직접 호출 전환 - v0.5.3

## 문제 정의

### 현상
- Daemon이 OpenClaw 게이트웨이에 OpenAI SDK(HTTP REST)로 `/v1/chat/completions`를 호출하지만, OpenClaw은 WebSocket(ACP) 기반이라 HTTP REST endpoint가 없음
- 결과: 모든 AI 호출이 404 Not Found로 실패

### 원인
`openclaw-client.ts`가 OpenAI SDK를 사용해 `http://openclaw:18789`로 HTTP POST를 보내지만, OpenClaw 게이트웨이는 OpenAI 호환 REST API를 제공하지 않음. WebSocket 또는 CLI(`openclaw agent`)로만 통신 가능.

### 영향
- AI 채팅 기능 완전 불능 — App→Relay→Daemon 전달은 성공하지만 AI 응답을 받을 수 없음

### 목표
- Daemon이 Anthropic API를 직접 호출하여 AI 응답을 받도록 전환
- 기존 `OpenClawClient` 인터페이스(`chat`, `chatStream`) 유지하여 호출부 변경 최소화
- streaming(delta) 지원 유지

### 비목표 (Out of Scope)
- OpenClaw WebSocket(ACP) 프로토콜 구현 (향후 Phase)
- `OpenClawClient` 인터페이스 변경
- tool_calls 구조 변경
- App 측 코드 수정

## 제약사항
- Anthropic API 키는 환경변수 `ANTHROPIC_API_KEY`로 전달 (이미 `.env`에 존재)
- `@anthropic-ai/sdk` 사용 (Anthropic 공식 SDK)
- 기존 `ChatMessage`, `ChatResponse`, `ToolCall` 타입 유지
