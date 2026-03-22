# 설계 - v0.5.3

## 변경 규모
**규모**: 일반 기능
**근거**: 외부 AI provider 경계 변경 + tool-call 형식 어댑터 + config/env 변경

---

## 문제 요약
OpenClaw이 HTTP REST API를 제공하지 않아 Daemon의 AI 호출이 404 실패. Anthropic SDK로 직접 호출하도록 전환.

> 상세: [README.md](README.md) 참조

## 접근법
`openclaw-client.ts` 내부 구현을 Anthropic SDK로 교체. `OpenClawClient` 인터페이스 유지. tool-call-loop.ts는 변경하지 않음 — 어댑터가 OpenAI 형식으로 입출력을 맞춤.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: OpenClaw ACP(WebSocket) 구현 | OpenClaw 생태계 활용 | ACP 프로토콜 구현 비용 큼 | ❌ |
| B: Anthropic SDK 직접 호출 | 공식 SDK, streaming/tools 지원 | OpenClaw 우회 | ✅ |

**선택 이유**: 데모 우선. Anthropic SDK는 streaming + tool_use 모두 지원.

## 기술 결정

### 1. 세션 이력
- 한 요청 안에서 tool-call loop가 만든 메시지 전체를 전달 (tool-call-loop.ts가 messages 배열 관리)
- **cross-turn 히스토리(이전 대화 기억)는 저장하지 않음** — 매 chat 요청이 독립적
- OpenClaw이 했던 cross-turn 히스토리 관리는 향후 Phase

## 범위 / 비범위
- **범위**: openclaw-client.ts 내부 구현 교체, config/env 변경, Anthropic SDK 패키지 추가
- **비범위**: tool-call-loop.ts 변경, App 코드 변경, cross-turn 히스토리 구현, OpenClaw ACP 구현

### 2. Anthropic 어댑터 매핑

| OpenAI (현재) | Anthropic (변환) |
|---|---|
| `messages[{role:'system',content}]` | `system` 파라미터로 분리 |
| `messages[{role:'user',content}]` | `messages[{role:'user',content}]` (동일) |
| `messages[{role:'assistant',content,tool_calls}]` | `messages[{role:'assistant',content:[{type:'tool_use',id,name,input}]}]` |
| `messages[{role:'tool',tool_call_id,content}]` | `messages[{role:'user',content:[{type:'tool_result',tool_use_id,content}]}]` |
| `tools[{type:'function',function:{name,description,parameters}}]` | `tools[{name,description,input_schema}]` |
| response `tool_calls[{id,function:{name,arguments}}]` | response `content[{type:'tool_use',id,name,input}]` |
| response `finish_reason:'tool_calls'` | response `stop_reason:'tool_use'` |

### 3. No Fallback 원칙
- API 키 없으면 daemon 시작 시 warn 로그만 (WDK 자체는 키 없이도 동작해야 하므로)
- 실제 chat 호출 시 Anthropic SDK가 에러를 throw → chat-handler가 잡아서 App에 에러 전달

### 4. 변경 파일
- `packages/daemon/src/openclaw-client.ts` — 내부 구현 교체
- `packages/daemon/src/config.ts` — `anthropicApiKey` 추가
- `docker-compose.yml` — daemon에 `ANTHROPIC_API_KEY` 환경변수 전달
- `packages/daemon/package.json` — `@anthropic-ai/sdk` 추가

## 테스트 전략
- Docker compose 리빌드 후 App에서 채팅 → AI 응답 수신 확인 (수동 E2E)
