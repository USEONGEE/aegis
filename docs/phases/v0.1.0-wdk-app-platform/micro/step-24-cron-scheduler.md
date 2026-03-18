# Step 24: daemon - Cron Scheduler

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 16 (wdk-host, ApprovalStore/SQLite), Step 19 (tool-call-loop)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/cron-scheduler.js` 생성. AI agent가 registerCron tool로 등록한 주기적 작업을 interval마다 자동 실행하고, daemon 재시작 후 복구한다 (DoD F34~F36).

**데이터 모델** (design.md crons 테이블):

```sql
CREATE TABLE crons (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  session_id TEXT NOT NULL,
  interval TEXT NOT NULL,         -- cron expression 또는 ms 단위
  prompt TEXT NOT NULL,
  chain TEXT,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);
```

- `createCronScheduler(store, processChat)`: 스케줄러 인스턴스 생성
- `register({ interval, prompt, chain, sessionId })`: cron 등록 → cronId 생성 → DB 저장 → 타이머 시작. 반환: `{ cronId, status: 'registered' }` (DoD F31)
- `list()`: active cron 목록 반환 (DoD F32)
- `remove(cronId)`: cron 비활성화 (is_active=0) → 타이머 제거. 반환: `{ status: 'removed' }` (DoD F33)
- `start()`: 모든 active cron의 타이머 시작 (daemon 시작 시 호출)
- `stop()`: 모든 타이머 정리 (graceful shutdown 시 호출)

**실행 로직**:
- interval마다 `processChat(userId, sessionId, prompt)` 호출 (DoD F34)
- `lastRunAt` 업데이트 → 중복 실행 방지 (DoD E9)
- 실행 중 에러 시 로깅 + 다음 interval에 재시도 (cron 자체는 중단하지 않음)

**재시작 복구** (DoD F36):
- daemon 시작 시 `start()` → DB에서 is_active=1인 cron 조회 → 각각 타이머 재등록
- `lastRunAt` 기반으로 다음 실행 시점 계산 (재시작 직후 밀린 실행은 1회만 수행)

## 2. 완료 조건
- [ ] `packages/daemon/src/cron-scheduler.js` 에서 `createCronScheduler` export
- [ ] `register()` 가 cronId 생성 + DB 저장 + 타이머 시작 (DoD F31)
- [ ] `list()` 가 active cron 목록 반환 (DoD F32)
- [ ] `remove(cronId)` 가 cron 비활성화 + 타이머 제거 (DoD F33)
- [ ] interval마다 processChat이 자동 호출됨 (DoD F34)
- [ ] remove 후 자동 실행 중단 (DoD F35)
- [ ] daemon 재시작 후 active cron이 DB에서 복구되어 자동 재등록 (DoD F36)
- [ ] lastRunAt 기반 중복 실행 방지 (DoD E9)
- [ ] 실행 에러 시 cron 중단하지 않고 다음 interval에 재시도
- [ ] `stop()` 호출 시 모든 타이머 정리
- [ ] `npm test -- packages/daemon` 통과 (cron-scheduler 단위 테스트, mock timer + processChat)

## 3. 롤백 방법
- `packages/daemon/src/cron-scheduler.js` 삭제
- tool-surface.js에서 cronScheduler 연동 제거
- index.js에서 scheduler.start()/stop() 호출 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  cron-scheduler.js       # Cron 등록/실행/영속/복구
packages/daemon/tests/
  cron-scheduler.test.js  # 단위 테스트 (mock timer + processChat)
```

### 수정 대상 파일
```
packages/daemon/src/tool-surface.js  # registerCron/listCrons/removeCron 핸들러에서 scheduler 호출
packages/daemon/src/index.js         # 시작 시 scheduler.start(), shutdown 시 scheduler.stop()
```

### Side Effect 위험
- SQLite crons 테이블 write
- processChat 주기적 호출 → OpenClaw API + WDK 상태 변경

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.js | Cron 등록/실행/영속/복구 | ✅ OK |
| cron-scheduler.test.js | 단위 테스트 | ✅ OK |
| tool-surface.js 수정 | cron tool 연동 | ✅ OK |
| index.js 수정 | start/stop 호출 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| register (cronId + DB + 타이머) | ✅ cron-scheduler.js | OK |
| list (active crons) | ✅ cron-scheduler.js | OK |
| remove (비활성화 + 타이머 제거) | ✅ cron-scheduler.js | OK |
| interval 실행 (processChat 호출) | ✅ cron-scheduler.js | OK |
| lastRunAt 기반 중복 방지 | ✅ cron-scheduler.js | OK |
| 재시작 복구 (start → DB 조회 → 재등록) | ✅ cron-scheduler.js | OK |
| 에러 시 재시도 (cron 유지) | ✅ cron-scheduler.js | OK |
| stop (타이머 정리) | ✅ cron-scheduler.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 25: daemon - Admin server](step-25-admin-server.md)
