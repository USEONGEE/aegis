# Step 02: DaemonStore 추출 + SqliteDaemonStore 구현

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (WdkStore에서 cron 제거되어야 DaemonStore로 이동 가능)

---

## 1. 구현 내용 (design.md 섹션 3.2, 3.4, 3.5, 7-Step2)

- `packages/daemon/src/daemon-store.ts` 인터페이스 정의 (6개 메서드, `listCrons(accountIndex: number | null)` — optional 아님)
- `packages/daemon/src/sqlite-daemon-store.ts` 구현 (SqliteApprovalStore의 cron 메서드 복사 + 별도 DB 파일)
- `packages/daemon/src/json-daemon-store.ts` 구현 (테스트용)
- `cron-scheduler.ts`의 로컬 `CronStore` 인터페이스를 `DaemonStore`로 교체
- `daemon/index.ts`에서 `SqliteDaemonStore` 생성 + cron-scheduler에 주입
- CronInput/StoredCron 타입은 guarded-wdk에서 import 유지

## 2. 완료 조건
- [ ] `packages/daemon/src/daemon-store.ts` 존재 + `DaemonStore` interface 정의 (6개 메서드)
- [ ] `listCrons` 시그니처가 `(accountIndex: number | null)` (optional 아님)
- [ ] `SqliteDaemonStore` 가 별도 SQLite 파일(daemon.db) 생성
- [ ] cron CRUD 동작 확인 (saveCron → listCrons → removeCron)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 성공
- [ ] DoD: F3, F4

## 3. 롤백 방법
- git revert — daemon 패키지 내부 변경만
- cron-scheduler는 DaemonStore 인터페이스로 교체만이므로 동작 동일

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── cron-scheduler.ts          # CronStore → DaemonStore 교체
└── index.ts                   # SqliteDaemonStore 생성 + 주입
```

### 신규 생성 파일
```
packages/daemon/src/
├── daemon-store.ts            # 신규 — DaemonStore interface
├── sqlite-daemon-store.ts     # 신규 — SQLite cron 구현
└── json-daemon-store.ts       # 신규 — JSON cron 구현 (테스트용)
```

### 테스트 파일
```
packages/daemon/tests/
└── sqlite-daemon-store.test.ts    # 신규 — cron CRUD 테스트
```

### Side Effect 위험
- cron-scheduler의 CronStore 인터페이스 변경 → 동일 메서드이므로 위험 낮음

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.ts | CronStore → DaemonStore 교체 | ✅ OK |
| daemon/index.ts | SqliteDaemonStore 생성 주입 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| cron CRUD 테스트 | ✅ 신규 테스트 추가 | OK |
| JsonDaemonStore 구현 | ✅ 신규 파일 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: Rejection 내부화](step-03-rejection-internalize.md)
