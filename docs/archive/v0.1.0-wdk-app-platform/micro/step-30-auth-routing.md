# Step 30: relay - JWT 인증 + userId 라우팅 + 디바이스 등록

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 27 (PgRegistry), Step 29 (WS 서버)

---

## 1. 구현 내용 (design.md 기반)

JWT 기반 인증 + userId 라우팅 + 디바이스 등록 REST API.

- `src/routes/auth.js`: 인증 관련 REST 엔드포인트
- `src/middleware/rate-limit.js`: 속도 제한 (기본 설정)
- `src/middleware/cors.js`: CORS 설정

**REST 엔드포인트**:
- `POST /api/auth/register` — 유저 생성 (id, password)
- `POST /api/auth/login` — 로그인 → JWT 발급
- `POST /api/auth/pair` — 디바이스 페어링 (pairingCode, publicKey → device 등록)
- `POST /api/auth/refresh` — JWT 갱신

**JWT 구조**:
- payload: `{ userId, deviceId, type: 'daemon'|'app' }`
- WebSocket 연결 시 authenticate 메시지에서 이 JWT 검증

**디바이스 등록 흐름**:
1. daemon이 register → login → JWT 획득
2. RN App이 pair 엔드포인트 → device 생성 (type: 'app', push_token)
3. WebSocket 연결 시 JWT로 인증 → userId에 연결 매핑

## 2. 완료 조건
- [ ] `POST /api/auth/register` — userId + password → users 테이블 생성, password bcrypt 해시
- [ ] `POST /api/auth/login` — userId + password → JWT 반환 (userId, deviceId, type 포함)
- [ ] `POST /api/auth/pair` — pairingCode + publicKey → devices 테이블에 type='app' row 생성 + JWT 반환
- [ ] `POST /api/auth/refresh` — 유효한 JWT → 새 JWT 반환
- [ ] JWT 서명 검증: 잘못된 JWT → 401
- [ ] 만료된 JWT → 401
- [ ] WebSocket authenticate 메시지에서 JWT 검증 → userId 매핑 연동
- [ ] rate-limit 미들웨어 적용 (auth 엔드포인트, 분당 30회)
- [ ] CORS 미들웨어 적용
- [ ] `npm test -- packages/relay` 통과 (인증 API 테스트)

## 3. 롤백 방법
- `src/routes/auth.js`, `src/middleware/` 삭제
- `src/index.js`에서 auth 라우트 + 미들웨어 등록 제거

---

## Scope

### 신규 생성 파일
```
packages/relay/
  src/routes/
    auth.js                        # 인증 REST 엔드포인트
  src/middleware/
    rate-limit.js                  # 속도 제한
    cors.js                        # CORS 설정
  tests/
    auth.test.js                   # 인증 API 테스트
```

### 수정 대상 파일
```
packages/relay/src/index.js        # auth 라우트 + 미들웨어 등록
packages/relay/src/routes/ws.js    # authenticate 메시지에서 JWT 검증 연동
packages/relay/package.json        # bcrypt, jsonwebtoken 의존성 추가
```

### Side Effect 위험
- ws.js 수정 — 기존 WebSocket 동작에 JWT 검증 추가
- PostgreSQL 연결 필요

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| routes/auth.js | 인증 REST API | ✅ OK |
| middleware/rate-limit.js | 속도 제한 | ✅ OK |
| middleware/cors.js | CORS | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| register/login/pair/refresh | ✅ auth.js | OK |
| JWT 발급/검증 | ✅ auth.js + ws.js | OK |
| bcrypt 해싱 | ✅ auth.js | OK |
| rate-limit | ✅ rate-limit.js | OK |
| CORS | ✅ cors.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 31: relay - 푸시 알림](step-31-push-notifications.md)
