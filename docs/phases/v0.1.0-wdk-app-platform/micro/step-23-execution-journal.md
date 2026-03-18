# Step 23: daemon - Execution Journal (intentId 기반 dedup)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 16 (wdk-host, ApprovalStore/SQLite)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/execution-journal.js` 생성. intentId 기반 중복 실행 방지(DoD F5)와 daemon 재시작 후 복구(DoD F18, E5)를 구현한다.

**상태 머신**:

```
received → evaluated → approved → broadcasted → settled
                ↓           ↓           ↓
              failed      failed      failed
```

- `received`: tool_call 수신, intentId 생성 (intentHash 기반)
- `evaluated`: policy 평가 완료 (AUTO / REQUIRE_APPROVAL / REJECT)
- `approved`: SignedApproval 검증 완료 (REQUIRE_APPROVAL 경로만)
- `broadcasted`: tx broadcast 완료 (tx_hash 기록)
- `settled`: tx 확정 (최종 상태)
- `failed`: 어느 단계에서든 실패 (최종 상태)

**데이터 모델** (design.md execution_journal 테이블):

```sql
CREATE TABLE execution_journal (
  intent_id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  chain TEXT NOT NULL,
  target_hash TEXT NOT NULL,       -- intentHash
  status TEXT NOT NULL,
  tx_hash TEXT,                    -- broadcasted 이후
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- `createJournal(store)`: Journal 인스턴스 생성
- `record(intentId, seedId, chain, targetHash)`: 새 entry 기록 (status: 'received'). 이미 존재하면 기존 상태 반환 (dedup)
- `transition(intentId, newStatus, txHash?)`: 상태 전이. 유효하지 않은 전이는 에러
- `get(intentId)`: entry 조회
- `listBySeed(seedId, options?)`: seed별 journal 목록 (페이지네이션)
- `isDuplicate(intentId)`: 중복 여부 확인 (broadcasted/settled 상태면 true)

**재시작 복구** (DoD E5):
- daemon 시작 시 `received`/`evaluated`/`approved` 상태의 entry를 조회
- `received`/`evaluated`: 재평가 또는 폐기 (configurable)
- `approved` + tx 미broadcast: 재broadcast 시도
- `broadcasted` + tx 미settled: tx 상태 확인 → settled 또는 failed로 전이

## 2. 완료 조건
- [ ] `packages/daemon/src/execution-journal.js` 에서 `createJournal` export
- [ ] `record(intentId, ...)` 가 새 entry 생성 (status: 'received')
- [ ] 이미 존재하는 intentId로 `record()` 호출 시 기존 상태 반환 (중복 생성 없음, DoD F5)
- [ ] `transition(intentId, newStatus)` 가 유효한 상태 전이만 허용
- [ ] 유효하지 않은 전이 시 에러 throw (예: received → settled 불가)
- [ ] `isDuplicate(intentId)` 가 broadcasted/settled 상태이면 true 반환
- [ ] `listBySeed(seedId)` 가 해당 seed의 journal 목록 반환
- [ ] SQLite execution_journal 테이블에 영속 저장
- [ ] daemon 재시작 후 미완료 entry 복구 로직 동작 (DoD E5)
- [ ] `npm test -- packages/daemon` 통과 (execution-journal 단위 테스트)

## 3. 롤백 방법
- `packages/daemon/src/execution-journal.js` 삭제
- tool-surface.js에서 journal 연동 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  execution-journal.js    # intentId dedup + 상태 머신 + 영속 + 복구
packages/daemon/tests/
  execution-journal.test.js # 단위 테스트
```

### 수정 대상 파일
```
packages/daemon/src/tool-surface.js  # sendTransaction/transfer에서 journal.record() + transition() 호출
packages/daemon/src/index.js         # 시작 시 journal 복구 로직 호출
```

### Side Effect 위험
- SQLite execution_journal 테이블 write
- 재시작 복구 시 tx 재broadcast 가능

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| execution-journal.js | intentId dedup + 상태 머신 | ✅ OK |
| execution-journal.test.js | 단위 테스트 | ✅ OK |
| tool-surface.js 수정 | journal 연동 | ✅ OK |
| index.js 수정 | 복구 로직 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| record (dedup) | ✅ execution-journal.js | OK |
| transition (상태 머신) | ✅ execution-journal.js | OK |
| isDuplicate | ✅ execution-journal.js | OK |
| listBySeed | ✅ execution-journal.js | OK |
| SQLite 영속 | ✅ execution-journal.js | OK |
| 재시작 복구 | ✅ execution-journal.js + index.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 24: daemon - Cron Scheduler](step-24-cron-scheduler.md)
