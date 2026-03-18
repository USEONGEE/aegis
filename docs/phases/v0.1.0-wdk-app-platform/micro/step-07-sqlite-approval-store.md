# Step 07: guarded-wdk - SqliteApprovalStore 구현

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 05

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/sqlite-approval-store.js`에 better-sqlite3 기반 ApprovalStore 구현. `~/.wdk/store/wdk.db` 경로에 데이터를 영속 저장.

### SQLite 스키마 (design.md 데이터 모델)

```sql
CREATE TABLE seeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mnemonic TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE policies (
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  chain TEXT NOT NULL,
  policies_json TEXT NOT NULL,
  signature_json TEXT NOT NULL,
  wdk_countersig TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seed_id, chain)
);

CREATE TABLE pending_requests (
  request_id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  type TEXT NOT NULL,
  chain TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  type TEXT NOT NULL,
  chain TEXT,
  target_hash TEXT NOT NULL,
  approver TEXT NOT NULL,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,
  signed_approval_json TEXT,
  timestamp INTEGER NOT NULL
);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  name TEXT,
  paired_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE nonces (
  approver TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_nonce INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (approver, device_id)
);

CREATE TABLE crons (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  session_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  prompt TEXT NOT NULL,
  chain TEXT,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE execution_journal (
  intent_id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  chain TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 구현 원칙

1. **생성자**: `new SqliteApprovalStore(dbPath)` — 기본값 `~/.wdk/store/wdk.db`
2. **초기화**: 생성자에서 DB 오픈 + 스키마 마이그레이션 (테이블 없으면 CREATE)
3. **동기 API**: better-sqlite3은 동기지만 ApprovalStore 인터페이스는 async → 동기 호출을 async로 래핑
4. **트랜잭션**: 다중 쓰기 시 `db.transaction()` 사용
5. **WAL 모드**: `PRAGMA journal_mode=WAL` (읽기 성능 향상)
6. **JSON 필드**: policies_json, metadata_json, signed_approval_json은 JSON.stringify/parse
7. **디렉토리 자동 생성**: DB 파일 경로의 디렉토리가 없으면 mkdirSync
8. **dispose()**: DB 연결 close

### 핵심 차이 (JsonApprovalStore 대비)
- 트랜잭션 지원 (원자성 보장)
- SQL 인덱스로 조회 성능
- 단일 파일 관리
- daemon 프로덕션 용도 (JsonApprovalStore는 개발/테스트용)

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/sqlite-approval-store.js` 파일 생성
- [ ] `SqliteApprovalStore extends ApprovalStore`
- [ ] `better-sqlite3`이 `package.json` dependencies에 추가
- [ ] 생성자에서 DB 파일 생성 + 스키마 마이그레이션 실행
- [ ] 22개 메서드 전부 구현 (Not implemented 에러 없음)
- [ ] `loadPolicy(seedId, chain)` → SELECT 쿼리, JSON.parse(policies_json) 반환
- [ ] `savePolicy(seedId, chain, sp)` → INSERT OR REPLACE
- [ ] `loadPending(seedId)` → WHERE seed_id = ? 필터링
- [ ] `savePending/removePending` → INSERT/DELETE
- [ ] `appendHistory` → INSERT
- [ ] `getHistory(seedId, { type, chain, limit, offset })` → WHERE + LIMIT + OFFSET
- [ ] `saveDevice/getDevice/revokeDevice/listDevices` → CRUD
- [ ] `revokeDevice(deviceId)` → `UPDATE SET revoked_at = now`
- [ ] `getLastNonce(approver, deviceId)` → SELECT, 없으면 0
- [ ] `updateNonce(approver, deviceId, nonce)` → INSERT OR REPLACE
- [ ] `listCrons/saveCron/removeCron/updateCronLastRun` → CRUD
- [ ] `addSeed/removeSeed/setActiveSeed/getActiveSeed/listSeeds` → CRUD
- [ ] `setActiveSeed`가 트랜잭션 내에서 기존 active 해제 + 새 active 설정
- [ ] seed A의 policy ≠ seed B의 policy (seed_id FK로 분리, DoD F17)
- [ ] DB 파일 삭제 후 재시작 → 스키마 재생성, 빈 상태로 정상 동작 (DoD F18)
- [ ] `WAL` 모드 활성화 확인
- [ ] `dispose()` 호출 시 DB 연결 닫힘
- [ ] `src/index.js`에서 `SqliteApprovalStore` re-export
- [ ] `npm test -- packages/guarded-wdk` 통과

## 3. 롤백 방법
- `packages/guarded-wdk/src/sqlite-approval-store.js` 삭제
- `package.json`에서 `better-sqlite3` 의존성 제거
- `index.js`에서 `SqliteApprovalStore` re-export 제거
- 테스트가 생성한 임시 DB 파일 정리

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/src/sqlite-approval-store.js        # SqliteApprovalStore 구현
packages/guarded-wdk/tests/sqlite-approval-store.test.js  # CRUD 단위 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/index.js      # SqliteApprovalStore re-export 추가
packages/guarded-wdk/package.json      # better-sqlite3 의존성 추가
```

### Side Effect 위험
- `better-sqlite3`은 네이티브 모듈 — npm install 시 prebuild 다운로드 또는 컴파일 필요
- 테스트 실행 시 임시 DB 파일 생성 (테스트 후 cleanup 필요)
- 기존 코드에 영향 없음

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| sqlite-approval-store.js | PRD SqliteApprovalStore 구현 | ✅ OK |
| sqlite-approval-store.test.js | DoD F15 (각 메서드 CRUD) | ✅ OK |
| package.json 수정 | better-sqlite3 의존성 | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 22개 메서드 구현 | ✅ sqlite-approval-store.js | OK |
| SQLite 스키마 (8개 테이블) | ✅ sqlite-approval-store.js | OK |
| WAL 모드 | ✅ sqlite-approval-store.js | OK |
| 트랜잭션 (setActiveSeed) | ✅ sqlite-approval-store.js | OK |
| 다중 seed FK 분리 | ✅ sqlite-approval-store.js | OK |
| dispose() | ✅ sqlite-approval-store.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 08: guarded-wdk - approval-verifier](step-08-approval-verifier.md)
