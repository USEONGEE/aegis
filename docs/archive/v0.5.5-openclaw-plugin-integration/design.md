# 설계 - v0.5.5 OpenClaw Plugin Integration

## 변경 규모

**규모**: 운영 리스크
**근거**:
- 3개+ 패키지 수정 (daemon, 신규 openclaw-plugin, docker)
- 데이터 흐름 역전 (daemon push → OpenClaw pull)
- 기존 코드 대량 삭제 (tool-call-loop.ts 197줄, SSE 파서 등)
- Docker 인프라 변경 (커스텀 Dockerfile, HTTP 포트 노출)

---

## 문제 요약

Daemon이 Anthropic SDK를 직접 호출하여 대화 세션이 유실됨. OpenClaw 게이트웨이가 Docker에 올라가 있지만 미사용. OpenClaw `/v1/responses`의 `tools` 파라미터는 무시되므로, 플러그인 SDK(`api.registerTool()`)로 WDK 도구를 등록해야 함.

> 상세: [README.md](README.md) 참조

## 접근법

OpenClaw 플러그인으로 WDK 15개 도구를 등록하고, 각 도구의 `execute()` 함수에서 daemon의 새 HTTP API를 호출한다. OpenClaw이 tool-call loop를 관리하고, daemon은 도구 실행만 담당한다.

```
변경 전: Daemon → Anthropic API (직접, 세션 없음)
                ↕ tool-call-loop (daemon 내부)
             Tool Surface

변경 후: Daemon → OpenClaw /v1/responses (세션 관리)
                       ↕ tool-call loop (OpenClaw 내부)
              WDK Plugin execute()
                    ↕ HTTP
              Daemon /api/tools/:name
                    ↕
              Tool Surface (기존)
```

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Plugin + Daemon HTTP API | Docker 표준(TCP), curl 디버깅 가능, 관심사 분리 | 변경 규모 큼, HTTP 서버 신규 추가 | ✅ |
| B: Plugin + Unix Socket | admin-server 재사용 | Docker 컨테이너 간 소켓 공유 비표준, 디버깅 어려움 | ❌ |
| C: tool-call loop 유지 + 세션만 활용 | 변경 최소 | tools 파라미터 무시 문제 미해결 — 핵심 기능 불가 | ❌ |

**선택 이유**: A만이 `tools` 파라미터 무시 문제를 근본 해결한다. B는 Docker 컨테이너 간 Unix socket 공유가 비표준이고 OS별 호환 문제가 있다. C는 핵심 문제(AI가 WDK 도구를 호출 못 함)를 해결하지 못한다.

## 기술 결정

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| 1 | HTTP 서버 | `node:http` 최소 서버 (admin-server와 별도) | Primitive First. admin-server는 Unix socket 프로토콜이므로 역할이 다름 |
| 2 | HTTP 인증 | Bearer token (`TOOL_API_TOKEN` 환경변수) | Docker 내부여도 최소 보호. 플러그인과 daemon이 동일 토큰 공유 |
| 3 | HTTP 포트 | `TOOL_API_PORT`, 기본 18790 | OpenClaw 18789 바로 다음. 외부 노출 불필요 (Docker 내부만) |
| 4 | API 계약 | `POST /api/tools/:name` body=`{args}` | 단일 엔드포인트 패턴. name은 URL path, args는 body |
| 5 | 플러그인 위치 | `packages/openclaw-plugin/` 신규 패키지 | 독립 배포 단위. Docker 빌드 시 마운트 |
| 6 | 플러그인 스키마 | `ai-tool-schema.ts`의 TOOL_DEFINITIONS에서 변환 | 스키마 소스 단일화 |
| 7 | tool-call-loop.ts | 삭제 | OpenClaw이 loop 관리하므로 dead code |
| 8 | chat-handler | `openclawClient.chat()` 한 번 호출 → 최종 응답만 relay 전달 | loop가 OpenClaw 내부에서 처리됨 |
| 9 | Streaming | Phase 1에서 비활성화 (최종 응답만 수신) | 동작 우선. 향후 SSE proxy로 복원 가능 |
| 10 | onToolStart/Done | Phase 1에서 제거 | 도구 실행이 OpenClaw 내부이므로 daemon이 감지 불가. 향후 복원 검토 |
| 11 | OpenClaw Docker | 커스텀 Dockerfile (베이스 + 플러그인 설치) | `FROM ghcr.io/openclaw/openclaw:latest` + 플러그인 COPY |
| 12 | 의존성 정리 | daemon에서 `@anthropic-ai/sdk` 제거 | Dead dependency |

---

## 범위 / 비범위

**범위 (In Scope)**:
- OpenClaw 플러그인 패키지 생성 (15개 도구 등록)
- Daemon HTTP Tool API 서버 추가
- chat-handler 단순화 (tool-call-loop 제거)
- openclaw-client.ts 단순화 (SSE 파서 제거, 비스트리밍만)
- Docker 구성 변경 (커스텀 OpenClaw 이미지, daemon HTTP 포트)
- OpenClaw daemon 에이전트 설정 (minimal tools profile)

**비범위 (Out of Scope)**:
- Streaming 복원 (Phase 1에서는 최종 응답만)
- onToolStart/onToolDone 이벤트 복원
- OpenClaw built-in 도구 활용 (exec, browser 등)
- 멀티 에이전트 구성
- 플러그인 npm 배포 (로컬 설치만)

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│                    Docker Network                    │
│                                                      │
│  ┌──────────┐    ┌──────────────────────────────┐   │
│  │  Daemon   │    │         OpenClaw              │   │
│  │          │    │                                │   │
│  │  chat    │───→│  /v1/responses                 │   │
│  │  handler │    │       │                        │   │
│  │          │←───│   final response               │   │
│  │          │    │       │                        │   │
│  │          │    │  ┌────▼────┐                   │   │
│  │  HTTP    │    │  │ Tool-   │                   │   │
│  │  Tool    │←───│  │ call    │  WDK Plugin       │   │
│  │  API     │    │  │ loop    │  execute()         │   │
│  │  :18790  │    │  └────┬────┘                   │   │
│  │    │     │    │       │                        │   │
│  │ ┌──▼───┐ │    └───────┼────────────────────────┘   │
│  │ │tool- │ │            │                            │
│  │ │surface│ │    HTTP POST /api/tools/:name           │
│  │ │.ts   │ │                                         │
│  │ └──────┘ │                                         │
│  └──────────┘                                         │
└─────────────────────────────────────────────────────┘
```

## 데이터 흐름

```
1. User → App → Relay → Daemon
   (chat message: {userId, sessionId, text})

2. Daemon → OpenClaw
   POST /v1/responses
   {model: "openclaw:daemon", input: text, user: "userId:sessionId"}

3. OpenClaw AI → Tool Call 결정
   (내부) model returns function_call: getBalance({chain: "ethereum", accountIndex: 0})

4. OpenClaw Plugin → Daemon
   POST http://daemon:18790/api/tools/getBalance
   Authorization: Bearer <token>
   {args: {chain: "ethereum", accountIndex: 0}}

5. Daemon tool-surface → 실행 → 결과 반환
   {ok: true, result: {status: "ok", balances: [...]}}

6. OpenClaw Plugin → AI에 결과 전달 (내부)
   → AI가 최종 텍스트 생성 또는 추가 도구 호출

7. OpenClaw → Daemon
   최종 응답: {output: [{type: "message", content: [{type: "output_text", text: "..."}]}]}

8. Daemon → Relay → App → User
   {type: "done", content: "Your ETH balance is...", ...}
```

## API/인터페이스 계약

### Daemon HTTP Tool API

**엔드포인트**: `POST /api/tools/:name`

**인증**: `Authorization: Bearer <TOOL_API_TOKEN>`

**요청**:
```json
{
  "args": {
    "chain": "ethereum",
    "accountIndex": 0
  }
}
```

**성공 응답** (200):
```json
{
  "ok": true,
  "result": {
    "status": "ok",
    "balances": [{"token": "ETH", "balance": "1.5"}]
  }
}
```

**에러 응답** (400/500):
```json
{
  "ok": false,
  "error": "WDK not initialized"
}
```

**Health check**: `GET /health` → `{"ok": true}`

### OpenClaw Plugin Tool 등록

```typescript
api.registerTool({
  name: "getBalance",
  description: "Get token balances for the active wallet on the specified chain.",
  parameters: Type.Object({
    chain: Type.String({ description: "Target chain identifier" }),
    accountIndex: Type.Number({ description: "BIP-44 account index" })
  }),
  async execute(_id, params) {
    const res = await fetch(`${DAEMON_URL}/api/tools/getBalance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOOL_API_TOKEN}`
      },
      body: JSON.stringify({ args: params })
    })
    const data = await res.json()
    return { content: [{ type: "text", text: JSON.stringify(data.result) }] }
  }
})
```

## 테스트 전략

| 레벨 | 대상 | 방법 |
|------|------|------|
| 단위 | Daemon HTTP Tool API | curl로 각 도구 엔드포인트 호출, 인증 실패 케이스 |
| 단위 | OpenClaw 플러그인 | 플러그인 로드 확인, 도구 등록 확인 |
| 통합 | Plugin → Daemon HTTP | Docker Compose 기동 후 OpenClaw에 chat 요청, 도구 호출 확인 |
| E2E | App → Relay → Daemon → OpenClaw → Plugin → Daemon → 응답 | 앱에서 "잔액 확인" 채팅, 실제 응답 수신 확인 |
| 세션 | 대화 맥락 유지 | 연속 2개 메시지 전송, 두 번째가 첫 번째를 참조하는지 확인 |

## 실패/에러 처리

| 시나리오 | 처리 방식 |
|---------|---------|
| Daemon HTTP API 연결 실패 | 플러그인 execute()에서 에러 반환 → OpenClaw AI가 사용자에게 에러 안내 |
| 도구 실행 타임아웃 | HTTP 요청 60초 타임아웃. 초과 시 에러 반환 |
| Daemon 미부팅 (facade null) | tool-surface가 "WDK not initialized" 에러 반환 |
| 잘못된 도구 이름 | HTTP 404 반환 → 플러그인이 에러 메시지로 변환 |
| 인증 실패 | HTTP 401 반환 |
| OpenClaw 재시작 | Daemon의 `/v1/responses` 호출 실패 → 재시도 또는 에러 응답 |

## 보안/권한

- HTTP Tool API는 Docker 내부 네트워크에서만 접근 가능 (포트 외부 미노출)
- Bearer token 인증으로 무단 호출 방지
- `TOOL_API_TOKEN`은 docker-compose 환경변수로 관리
- 도구별 권한 모델은 기존 facade required guard 유지 (변경 없음)

## 리스크/오픈 이슈

| # | 이슈 | 영향 | 대응 |
|---|------|------|------|
| 1 | Streaming 비활성화 | UX 저하 — 긴 응답 시 사용자가 빈 화면 대기 | Phase 1 이후 SSE proxy로 복원 검토 |
| 2 | onToolStart/Done 이벤트 없음 | 도구 실행 중 사용자에게 진행 상태 미표시 | Phase 1 이후 복원 방안 검토 |
| 3 | OpenClaw Plugin SDK 버전 호환 | 플러그인이 OpenClaw 버전 업데이트에 깨질 수 있음 | openclaw 이미지 버전 고정 |
| 4 | OpenClaw built-in 도구 간섭 | minimal profile이어도 session_status는 남음 | 실사용 시 AI가 혼동하는지 모니터링 |
| 5 | 대화 히스토리 무한 증가 | OpenClaw 세션이 계속 커짐 | OpenClaw의 context pruning 설정 활용 |
