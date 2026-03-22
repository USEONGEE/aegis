# Step 04: Journal 내부화

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (feature branch 권장)
- **선행 조건**: Step 01 (WdkStore), Step 03 (dedupKey 함수)

---

## 1. 구현 내용 (design.md 섹션 4.2)

- `packages/daemon/src/execution-journal.ts`를 `packages/guarded-wdk/src/execution-journal.ts`로 이동
- Logger를 `JournalLogger` 인터페이스로 추상화 (pino 직접 의존 회피)
- 인메모리 dedup 인덱스를 `dedupKey` 기준으로 변경 (기존 targetHash → dedupKey)
- `DuplicateIntentError` 클래스 추가 (`packages/guarded-wdk/src/errors.ts`)
- `guarded-middleware.ts` MiddlewareConfig에 `journal: ExecutionJournal | null` 추가
- sendTransaction/transfer/signTransaction 래퍼에 journal 호출 삽입 (track, isDuplicate, updateStatus)
- `guarded-wdk-factory.ts`에서 ExecutionJournal 인스턴스 생성 + middleware에 주입
- 데이터 모델: JournalInput/StoredJournal에서 `targetHash` → `dedupKey` rename
- SQLite/JSON 컬럼/키 변경
- `daemon/execution-journal.ts` 삭제
- `daemon/tool-surface.ts`에서 journal 관련 코드 전체 제거
- `daemon/index.ts`에서 ExecutionJournal import/생성 제거

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/execution-journal.ts` 존재
- [ ] `packages/daemon/src/execution-journal.ts` 부재
- [ ] guarded-wdk 테스트: 같은 (chainId, to, data, value)로 2회 호출 → 2번째 `DuplicateIntentError`
- [ ] guarded-wdk 테스트: `journal: null`로 middleware 생성 → sendTransaction 정상 실행
- [ ] guarded-wdk 테스트: sendTransaction → journal.track 호출 → 성공 시 settled, 실패 시 failed
- [ ] `grep "pino" packages/guarded-wdk/package.json` 결과 0건 (JournalLogger 인터페이스 사용)
- [ ] `grep -r "targetHash" packages/guarded-wdk/src/execution-journal.ts` 결과 0건
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 성공
- [ ] DoD: F7, F8, F15(journal), N6, E2, E4

## 3. 롤백 방법
- feature branch에서 작업 → 문제 시 branch 폐기
- journal은 중복 실행 방지 담당이므로 회귀 시 tx 중복 실행 위험 — 테스트 필수

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts       # MiddlewareConfig에 journal 추가, 래퍼에 journal 호출 삽입
├── guarded-wdk-factory.ts     # ExecutionJournal 인스턴스 생성 + middleware 주입
├── errors.ts                  # DuplicateIntentError 추가
├── wdk-store.ts               # JournalInput/StoredJournal 타입 targetHash→dedupKey
├── sqlite-wdk-store.ts        # journal 컬럼 target_hash→dedup_key
├── json-wdk-store.ts          # journal JSON 키 변경
└── index.ts                   # ExecutionJournal, DuplicateIntentError export 추가

packages/daemon/src/
├── execution-journal.ts       # 삭제
├── tool-surface.ts            # journal 관련 코드 제거
├── index.ts                   # ExecutionJournal import/생성 제거
└── ports.ts                   # journal 관련 타입 제거
```

### 신규 생성 파일
```
packages/guarded-wdk/src/
└── execution-journal.ts       # daemon에서 이동 (JournalLogger 인터페이스 포함)
```

### 테스트 파일
```
packages/guarded-wdk/tests/
├── execution-journal.test.ts      # daemon에서 이동 + WdkStore mock으로 교체
├── integration.test.ts            # journal 내부화 검증 (dedup, track, updateStatus)
└── sqlite-wdk-store.test.ts       # journal 컬럼 rename 반영

packages/daemon/tests/
├── execution-journal.test.ts      # 삭제
└── tool-surface.test.ts           # journal mock 제거 반영
```

### Side Effect 위험
- **높음**: journal은 중복 실행 방지 → 회귀 시 실제 자산 손실 가능. isDuplicate 단위 + 통합 테스트 필수

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| daemon/ports.ts | journal 타입 정의 제거 필요 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| JournalLogger 인터페이스 정의 | ✅ execution-journal.ts 내부 | OK |
| DuplicateIntentError | ✅ errors.ts | OK |
| 테스트 파일 이동/삭제 | ✅ 추가됨 | OK |
| guarded-wdk index.ts export | ✅ Scope에 있음 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 05: Facade 확장](step-05-facade-expand.md)
