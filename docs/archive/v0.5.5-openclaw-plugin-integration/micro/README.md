# 작업 티켓 - v0.5.5 OpenClaw Plugin Integration

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Daemon HTTP Tool API 서버 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | OpenClaw 플러그인 생성 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | Chat handler 단순화 + loop 제거 | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | Docker 구성 변경 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | 통합 테스트 + 정리 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 (HTTP Tool API)
  ↓
02 (OpenClaw Plugin)  ──→  04 (Docker)
  ↓
03 (Chat handler 단순화)
  ↓
05 (통합 테스트 + 정리)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| OpenClaw `/v1/responses`로 AI 호출 | Step 03 | ✅ |
| 세션/대화 히스토리 관리 | Step 03, 05 | ✅ |
| WDK 도구 15개 플러그인 등록 | Step 02 | ✅ |
| tool-call loop OpenClaw 위임 | Step 02, 03 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: 15개 도구 등록 | Step 02 | ✅ |
| F2: HTTP Tool API 동작 | Step 01 | ✅ |
| F3: 도구 호출 동작 | Step 02, 05 | ✅ |
| F4: 세션 유지 | Step 03, 05 | ✅ |
| F5: OpenClaw 통해 응답 | Step 03 | ✅ |
| F6: E2E 동작 | Step 04, 05 | ✅ |
| N1: daemon tsc 통과 | Step 03 | ✅ |
| N2: plugin tsc 통과 | Step 02 | ✅ |
| N3: @anthropic-ai/sdk 제거 | Step 05 | ✅ |
| N4: Docker 전체 기동 | Step 04 | ✅ |
| N5: Bearer token 인증 | Step 01 | ✅ |
| N6: tool-call-loop.ts 삭제 | Step 03 | ✅ |
| E1: daemon 미부팅 시 에러 | Step 02, 05 | ✅ |
| E2: WDK 미초기화 에러 | Step 01 | ✅ |
| E3: 잘못된 도구명 404 | Step 01 | ✅ |
| E4: 인증 토큰 불일치 401 | Step 01 | ✅ |
| E5: 타임아웃 | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| #1 node:http 서버 | Step 01 | ✅ |
| #2 Bearer token 인증 | Step 01 | ✅ |
| #3 포트 18790 | Step 01, 04 | ✅ |
| #4 POST /api/tools/:name | Step 01 | ✅ |
| #5 플러그인 패키지 | Step 02 | ✅ |
| #6 스키마 변환 | Step 02 | ✅ |
| #7 tool-call-loop 삭제 | Step 03 | ✅ |
| #8 chat-handler 단순화 | Step 03 | ✅ |
| #9 Streaming 비활성화 | Step 03 | ✅ |
| #10 콜백 제거 | Step 03 | ✅ |
| #11 커스텀 Dockerfile | Step 04 | ✅ |
| #12 @anthropic-ai/sdk 제거 | Step 05 | ✅ |

## Step 상세
- [Step 01: Daemon HTTP Tool API](step-01-daemon-http-tool-api.md)
- [Step 02: OpenClaw 플러그인 생성](step-02-openclaw-plugin.md)
- [Step 03: Chat handler 단순화](step-03-chat-handler-simplify.md)
- [Step 04: Docker 구성 변경](step-04-docker-config.md)
- [Step 05: 통합 테스트 + 정리](step-05-integration-cleanup.md)
