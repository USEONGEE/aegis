# Step 26: relay - 프로젝트 셋업

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (canonical, 루트 workspaces 설정)

---

## 1. 구현 내용 (design.md 기반)

`packages/relay` 패키지 생성. Relay 서버의 기본 인프라를 셋업한다.

- `package.json`: `@wdk-app/relay`, dependencies (fastify, @fastify/websocket, ioredis, pg, dotenv)
- `src/index.js`: Fastify 서버 생성 + 기본 health check route (`GET /health`)
- `src/config.js`: 환경 변수 로드 (REDIS_URL, DATABASE_URL, PORT, JWT_SECRET)
- `docker-compose.yml`: relay + redis + postgres 3개 서비스 정의
- `.env.example`: 환경 변수 템플릿

Relay는 독립 패키지 — canonical을 import하지 않음. 메시지만 중계한다.

## 2. 완료 조건
- [ ] `packages/relay/package.json` 생성 (name: `@wdk-app/relay`)
- [ ] `packages/relay/src/index.js`에서 Fastify 서버 생성 + `GET /health` → `{ status: 'ok' }`
- [ ] `packages/relay/src/config.js`에서 REDIS_URL, DATABASE_URL, PORT, JWT_SECRET 로드
- [ ] `packages/relay/docker-compose.yml`에 relay, redis, postgres 3개 서비스 정의
- [ ] `docker-compose up -d` → `docker-compose ps` → 3개 서비스 running
- [ ] redis 서비스: 포트 6379, 볼륨 마운트
- [ ] postgres 서비스: 포트 5432, 초기 DB 생성, 볼륨 마운트
- [ ] `GET http://localhost:<PORT>/health` → 200 `{ status: 'ok' }`
- [ ] 루트 `package.json` workspaces에 `packages/relay` 추가
- [ ] `npm test -- packages/relay` 통과 (health check 테스트)

## 3. 롤백 방법
- `packages/relay` 디렉토리 삭제
- 루트 `package.json`에서 workspace 제거
- `docker-compose down -v` (볼륨 포함 삭제)

---

## Scope

### 신규 생성 파일
```
packages/relay/
  package.json
  .env.example
  docker-compose.yml
  src/
    index.js              # Fastify 서버 생성 + health check
    config.js             # 환경 변수 로드
  tests/
    health.test.js        # health check 테스트
```

### 수정 대상 파일
```
package.json              # workspaces에 packages/relay 추가
```

### Side Effect 위험
- 없음 (신규 패키지, 기존 코드 수정 없음)
- docker-compose는 로컬 포트(6379, 5432) 사용 — 충돌 시 포트 변경 필요

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| src/index.js | Fastify 서버 + health check | ✅ OK |
| src/config.js | 환경 변수 로드 | ✅ OK |
| docker-compose.yml | relay + redis + postgres | ✅ OK |
| .env.example | 환경 변수 템플릿 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Fastify 서버 생성 | ✅ index.js | OK |
| config 로드 | ✅ config.js | OK |
| docker-compose 정의 | ✅ docker-compose.yml | OK |

### 검증 통과: ✅

---

→ 다음: [Step 27: relay - PgRegistry](step-27-pg-registry.md)
