# Step 27: relay - PostgreSQL Registry

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 26

---

## 1. 구현 내용 (design.md 기반)

PostgreSQL 스키마 정의 + RegistryAdapter 추상 인터페이스 + PgRegistry 구현.

- `src/registry/registry-adapter.js`: RegistryAdapter 추상 인터페이스 (createUser, getUser, createDevice, getDevice, getDevicesByUser, createSession, getSession)
- `src/registry/pg-registry.js`: PostgreSQL 기반 구현 (pg 클라이언트 사용)
- `sql/init.sql`: 테이블 생성 DDL (users, devices, sessions)
- docker-compose.yml에서 postgres 초기화 시 `init.sql` 실행

**PostgreSQL 스키마 (design.md)**:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,           -- 'daemon' | 'app'
  push_token TEXT,              -- Expo push token (app only)
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
```

## 2. 완료 조건
- [ ] `src/registry/registry-adapter.js`에서 RegistryAdapter 추상 인터페이스 정의 (createUser, getUser, createDevice, getDevice, getDevicesByUser, createSession, getSession, updateDeviceLastSeen, updateDevicePushToken)
- [ ] `src/registry/pg-registry.js`에서 PgRegistry가 RegistryAdapter를 구현
- [ ] `sql/init.sql`에 users, devices, sessions 테이블 DDL 정의
- [ ] docker-compose.yml에서 postgres 초기화 시 `init.sql` 마운트
- [ ] `createUser(id, passwordHash)` → users 테이블에 row 생성
- [ ] `getUser(id)` → user row 반환 또는 null
- [ ] `createDevice(id, userId, type)` → devices 테이블에 row 생성
- [ ] `getDevice(id)` → device row 반환 또는 null
- [ ] `getDevicesByUser(userId)` → 해당 user의 모든 device 배열 반환
- [ ] `createSession(id, userId, metadata)` → sessions 테이블에 row 생성
- [ ] `getSession(id)` → session row 반환 또는 null
- [ ] `updateDeviceLastSeen(deviceId)` → last_seen_at 업데이트
- [ ] `updateDevicePushToken(deviceId, pushToken)` → push_token 업데이트
- [ ] `npm test -- packages/relay` 통과 (PgRegistry 통합 테스트)

## 3. 롤백 방법
- `src/registry/`, `sql/` 디렉토리 삭제
- docker-compose.yml에서 init.sql 마운트 제거

---

## Scope

### 신규 생성 파일
```
packages/relay/
  sql/
    init.sql                        # DDL (users, devices, sessions)
  src/registry/
    registry-adapter.js             # 추상 인터페이스
    pg-registry.js                  # PostgreSQL 구현
  tests/
    pg-registry.test.js             # PgRegistry 통합 테스트
```

### 수정 대상 파일
```
packages/relay/docker-compose.yml   # postgres init.sql 마운트 추가
```

### Side Effect 위험
- docker-compose.yml 수정 — postgres 볼륨 변경 시 기존 데이터 유실 가능

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| registry-adapter.js | 추상 인터페이스 | ✅ OK |
| pg-registry.js | PostgreSQL 구현 | ✅ OK |
| init.sql | DDL 정의 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| users 테이블 | ✅ init.sql | OK |
| devices 테이블 | ✅ init.sql | OK |
| sessions 테이블 | ✅ init.sql | OK |
| RegistryAdapter 인터페이스 | ✅ registry-adapter.js | OK |
| PgRegistry 구현 | ✅ pg-registry.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 28: relay - RedisQueue](step-28-redis-queue.md)
