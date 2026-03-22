# Step 07: 정리 + 테스트 보강

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01~06 모두 완료

---

## 1. 구현 내용 (design.md 섹션 7-Step7)

- `approval-store.ts` 파일 삭제 (WdkStore로 완전 대체 확인)
- 사용하지 않는 import/export 정리
- dead-exports CI 체크 재실행
- 통합 테스트 작성: daemon → facade → WdkStore 전체 흐름
- 데이터 모델에서 `targetHash` 잔존 참조 제거 확인
- JsonWdkStore/JsonDaemonStore 테스트 파일 분리 확인
- deleteWallet 시 cron 무관함 테스트

## 2. 완료 조건
- [ ] `grep -r "targetHash" packages/guarded-wdk/src/ packages/daemon/src/` 결과 0건
- [ ] `grep -r "ApprovalStore" packages/` 결과 0건 (주석/문서 제외)
- [ ] guarded-wdk 테스트: deleteWallet 후 daemon.db crons 무변경
- [ ] JsonWdkStore + JsonDaemonStore 별도 디렉토리 파일 생성 확인
- [ ] `npx tsc -p packages/canonical/tsconfig.json --noEmit` 성공
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 성공
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 성공
- [ ] `npm test` 전체 통과
- [ ] DoD: F15, N1, N7, E5, E6

## 3. 롤백 방법
- git revert — 정리/테스트만이므로 위험 낮음

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts          # 삭제 확인 (Step 01에서 이미 처리된 경우 skip)
├── store-types.ts             # targetHash 잔존 확인
└── index.ts                   # 미사용 export 정리

packages/daemon/src/
└── (전체)                      # targetHash 잔존 확인
```

### 테스트 파일
```
packages/guarded-wdk/tests/
├── sqlite-wdk-store.test.ts       # deleteWallet cron 무관 테스트 (E5)
├── json-wdk-store.test.ts         # JsonWdkStore 별도 디렉토리 확인 (E6)
└── integration.test.ts            # facade→WdkStore 전체 흐름 통합 테스트

packages/daemon/tests/
├── sqlite-daemon-store.test.ts    # JsonDaemonStore 별도 디렉토리 확인 (E6)
└── (기존 테스트 전체 통과 확인)
```

### Side Effect 위험
- 낮음 — 정리 및 테스트만

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts 삭제 | Step 01에서 이미 처리됨 → 확인만 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| targetHash 잔존 확인 | ✅ 전체 패키지 grep | OK |
| 통합 테스트 추가 | ✅ 테스트 파일 목록 | OK |
| dead-exports 체크 재실행 | N/A — 별도 phase, 확인만 | OK |

### 검증 통과: ✅

---

→ Phase Complete
