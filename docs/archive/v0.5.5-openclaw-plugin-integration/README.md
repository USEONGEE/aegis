# OpenClaw Plugin Integration — v0.5.5

## 문제 정의

### 현상
- Daemon이 Anthropic SDK를 직접 호출하여 AI 응답을 생성하고 있음
- 매 `processChat()` 호출마다 새로운 메시지 배열로 시작하여 **이전 대화 맥락이 완전히 유실됨**
- Docker Compose에 OpenClaw 서비스가 올라가 있지만, daemon이 연결하지 않는 죽은 인프라 상태
- `openclaw-client.ts`라는 이름이지만 실제로는 `new Anthropic()` — Anthropic SDK 직접 호출

### 원인
- 원래 OpenClaw 연동을 시도했으나, OpenClaw의 HTTP REST endpoint(`/v1/chat/completions`)가 없어 404 발생
- 원인 조사 없이 Anthropic SDK 직접 호출로 우회해버림
- OpenClaw은 WebSocket 기반 게이트웨이이며, HTTP API는 `/v1/responses` (OpenResponses API)를 제공
- `/v1/responses`는 정상 동작하지만 `tools` 파라미터로 custom tool 주입이 불가 — OpenClaw 플러그인으로 도구를 등록해야 함

### 영향
- **세션 유실**: 사용자가 "아까 말한 거" 같은 참조를 하면 AI가 이해 못 함
- **불필요한 토큰 소비**: 매번 전체 맥락을 다시 보내야 함 (현재는 보내지도 않음)
- **죽은 인프라**: OpenClaw 컨테이너가 리소스만 소비하고 사용되지 않음
- **아키텍처 괴리**: 원래 설계(`tool-call-loop.ts` 주석: "OpenClaw manages session history")와 실제 구현이 불일치

### 목표
1. Daemon이 OpenClaw `/v1/responses` API를 통해 AI를 호출
2. OpenClaw이 세션/대화 히스토리를 관리 (이전 대화 맥락 유지)
3. WDK 도구 15개를 OpenClaw 플러그인으로 등록하여 모델이 직접 호출 가능
4. Daemon의 tool-call loop를 OpenClaw에 위임 (daemon은 tool execution HTTP API만 제공)

### 비목표 (Out of Scope)
- OpenClaw의 built-in 도구(exec, browser 등) 활용 — WDK 전용 도구만 등록
- OpenClaw 멀티 에이전트 구성 — 단일 daemon 에이전트만 사용
- OpenClaw WebSocket 프로토콜 직접 구현 — `/v1/responses` HTTP API 사용
- Daemon의 tool-surface 로직 변경 — 기존 도구 실행 로직 재사용

## 제약사항
- OpenClaw 플러그인은 TypeScript ESM, `openclaw/plugin-sdk` import 필요
- 플러그인의 `execute()` 함수에서 daemon HTTP API를 호출하므로 Docker 네트워크 내 통신 필요
- OpenClaw 플러그인 설치는 `openclaw plugins install` 또는 extensions/ 디렉토리 배치
- OpenClaw 컨테이너 이미지(`ghcr.io/openclaw/openclaw:latest`)에 플러그인을 포함시키는 빌드 전략 필요

## 조사 결과 요약

| 항목 | 결과 |
|------|------|
| OpenClaw `/v1/responses` | 정상 동작, 세션 관리 확인 |
| custom `tools` 파라미터 | 무시됨 — 모델에 전달 안 됨 |
| `api.registerTool()` 플러그인 | 공식 지원, 모델이 직접 호출 가능 |
| 플러그인 `execute()` 내 HTTP 호출 | async 함수이므로 fetch 가능 |
| OpenClaw gateway token | `OPENCLAW_GATEWAY_TOKEN` env로 설정 가능 |
| daemon agent (minimal profile) | `tools.profile: "minimal"` 설정 확인 |
