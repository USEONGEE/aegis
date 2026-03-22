# Step 01: Daemon HTTP Tool API 서버

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (HTTP 서버 코드 제거하면 원복)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

- `node:http` 기반 최소 HTTP 서버 생성 (`tool-api-server.ts`)
- `POST /api/tools/:name` 엔드포인트 구현
- Bearer token 인증 (`TOOL_API_TOKEN` 환경변수)
- `GET /health` 헬스체크 엔드포인트
- `executeToolCall()` 함수 호출하여 기존 tool-surface 재사용
- config.ts에 `toolApiPort`, `toolApiToken` 추가
- index.ts에서 서버 시작 (ToolExecutionContext 주입)

## 2. 완료 조건
- [ ] `tool-api-server.ts` 파일 존재
- [ ] `curl POST http://localhost:18790/api/tools/getBalance -H "Authorization: Bearer <token>" -d '{"args":{"chain":"ethereum","accountIndex":0}}'` → 200 응답 (또는 facade null 시 에러 메시지)
- [ ] `curl GET http://localhost:18790/health` → `{"ok":true}`
- [ ] 토큰 없이 요청 시 401 응답
- [ ] 존재하지 않는 도구명 요청 시 404 응답
- [ ] config.ts에 `toolApiPort`, `toolApiToken` 필드 추가됨
- [ ] `npx tsc --noEmit` 에러 0

## 3. 롤백 방법
- `tool-api-server.ts` 삭제
- config.ts, index.ts에서 관련 코드 제거
- 영향 범위: daemon 패키지만

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── config.ts          # 수정 - toolApiPort, toolApiToken 추가
└── index.ts           # 수정 - HTTP Tool API 서버 시작 호출
```

### 신규 생성 파일
```
packages/daemon/src/
└── tool-api-server.ts  # 신규 - HTTP 서버 + /api/tools/:name 핸들러
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| tool-surface.ts | 참조 (변경 없음) | executeToolCall() 호출 |
| config.ts | 직접 수정 | 2개 필드 추가 |
| index.ts | 직접 수정 | 서버 시작 코드 추가 |

### Side Effect 위험
- 없음. 기존 코드에 영향 없는 순수 추가 작업.

### 참고할 기존 패턴
- `admin-server.ts`: Unix socket 서버 패턴 (listen/close 구조)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| config.ts | toolApiPort, toolApiToken 추가 | ✅ OK |
| index.ts | 서버 시작 코드 | ✅ OK |
| tool-api-server.ts | HTTP 서버 핸들러 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| HTTP 서버 생성 | ✅ tool-api-server.ts | OK |
| Bearer token 인증 | ✅ tool-api-server.ts | OK |
| config 필드 추가 | ✅ config.ts | OK |
| 서버 시작 | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: OpenClaw 플러그인 생성](step-02-openclaw-plugin.md)
