# DoD (Definition of Done) - v0.5.5

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | OpenClaw 플러그인에 15개 WDK 도구가 등록됨 | `docker exec openclaw openclaw agents list` 에서 daemon 에이전트의 도구 목록 확인 |
| F2 | Daemon HTTP Tool API가 `POST /api/tools/:name`으로 도구 실행 가능 | `curl -X POST http://localhost:18790/api/tools/getBalance -H "Authorization: Bearer <token>" -d '{"args":{"chain":"ethereum","accountIndex":0}}'` → 200 응답 |
| F3 | OpenClaw `/v1/responses`로 채팅 시 WDK 도구가 호출됨 | `curl POST /v1/responses` with "Check my ETH balance" → 응답에 실제 잔액 정보 포함 |
| F4 | 대화 세션이 유지됨 — 이전 대화 맥락 참조 가능 | 같은 `user` 파라미터로 2회 연속 호출, 두 번째 호출에서 "아까 확인한 잔액" 참조 시 정확한 응답 |
| F5 | Daemon의 chat handler가 OpenClaw `/v1/responses`를 통해 응답 | Daemon 로그에서 `OpenClaw API` 호출 확인 + Anthropic SDK 직접 호출 없음 |
| F6 | App → Relay → Daemon → OpenClaw → Plugin → Daemon → Relay → App 전체 E2E 동작 | 앱에서 채팅 메시지 전송 → 응답 수신 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | daemon 패키지 TypeScript strict 모드 에러 0 | `cd packages/daemon && npx tsc --noEmit` |
| N2 | openclaw-plugin 패키지 TypeScript 에러 0 | `cd packages/openclaw-plugin && npx tsc --noEmit` |
| N3 | `@anthropic-ai/sdk` 의존성 제거됨 | `grep "anthropic" packages/daemon/package.json` → 결과 없음 |
| N4 | Docker Compose로 전체 스택 기동 성공 | `docker compose up -d && docker compose ps` → 모든 서비스 healthy/running |
| N5 | HTTP Tool API에 Bearer token 인증 적용 | 토큰 없이 요청 시 401 응답 |
| N6 | tool-call-loop.ts 삭제됨 | `ls packages/daemon/src/tool-call-loop.ts` → 파일 없음 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | Daemon 미부팅 상태에서 플러그인이 도구 호출 | HTTP 연결 실패 → 플러그인이 에러 텍스트 반환 → AI가 사용자에게 안내 | OpenClaw만 기동, daemon 중지 상태에서 채팅 |
| E2 | WDK 미초기화 (master seed 없음)에서 facade-required 도구 호출 | tool-surface가 "WDK not initialized" 에러 반환 → AI가 안내 | MASTER_SEED 환경변수 없이 daemon 기동 후 채팅 |
| E3 | 잘못된 도구 이름으로 HTTP 요청 | 404 응답 | `curl POST /api/tools/nonExistentTool` → 404 |
| E4 | 인증 토큰 불일치 | 401 응답 | 잘못된 토큰으로 HTTP 요청 |
| E5 | 도구 실행 중 긴 처리 시간 (예: 트랜잭션 대기) | 60초 타임아웃 후 에러 | 타임아웃 테스트 (mock) |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| OpenClaw `/v1/responses`로 AI 호출 | F5, F6 | ✅ |
| 세션/대화 히스토리 관리 | F4 | ✅ |
| WDK 도구 15개 플러그인 등록 | F1, F3 | ✅ |
| tool-call loop OpenClaw 위임 | F3, N6 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| HTTP Tool API (node:http, :18790) | F2, N5 | ✅ |
| Bearer token 인증 | N5, E4 | ✅ |
| OpenClaw 플러그인 (api.registerTool) | F1, F3 | ✅ |
| tool-call-loop.ts 삭제 | N6 | ✅ |
| @anthropic-ai/sdk 제거 | N3 | ✅ |
| Docker 커스텀 이미지 | N4 | ✅ |
| Streaming Phase 1 비활성화 | (의도적 비범위) | ✅ |
