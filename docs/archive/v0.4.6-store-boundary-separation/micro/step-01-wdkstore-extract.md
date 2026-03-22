# Step 01: WdkStore 추상 클래스 추출 + rename

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (guarded-wdk 내부만 변경)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 섹션 3.1, 3.3, 3.5, 7-Step1)

- `packages/guarded-wdk/src/wdk-store.ts` 생성: ApprovalStore에서 cron 4개 메서드 제거, 모든 메서드를 `abstract` 키워드로 전환
- `SqliteApprovalStore` → `SqliteWdkStore` 리네임 (`extends WdkStore`), cron 메서드/DDL 제거, `deleteWallet()` 트랜잭션에서 crons 삭제 제거
- `JsonApprovalStore` → `JsonWdkStore` 리네임 (`extends WdkStore`), cron 메서드/파일 제거
- `approval-store.ts`에서 `ApprovalStore` 클래스 삭제
- `index.ts` export 변경: `ApprovalStore` → `WdkStore`, `SqliteApprovalStore` → `SqliteWdkStore`, `JsonApprovalStore` → `JsonWdkStore`
- 파일 리네임: `sqlite-approval-store.ts` → `sqlite-wdk-store.ts`, `json-approval-store.ts` → `json-wdk-store.ts`
- guarded-wdk 내 모든 import/참조 업데이트
- backward compat alias 만들지 않음 (No Backward Compatibility)

## 2. 완료 조건
- [ ] `grep -r "class ApprovalStore" packages/guarded-wdk/` 결과 0건
- [ ] `grep -r "class WdkStore" packages/guarded-wdk/src/wdk-store.ts` 결과 1건
- [ ] `grep -r "SqliteApprovalStore\|JsonApprovalStore" packages/guarded-wdk/src/` 결과 0건
- [ ] `wdk-store.ts`에 `abstract` 키워드 사용 (throw 기본 구현 아님)
- [ ] cron 관련 메서드 (`listCrons`, `saveCron`, `removeCron`, `updateCronLastRun`) WdkStore에 없음
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 성공
- [ ] DoD: F1, F2

## 3. 롤백 방법
- git revert로 이 step의 커밋 되돌리기
- guarded-wdk 패키지 내부만 변경이므로 daemon 무영향

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts          # 삭제 → wdk-store.ts로 대체
├── sqlite-approval-store.ts   # 삭제 → sqlite-wdk-store.ts로 대체
├── json-approval-store.ts     # 삭제 → json-wdk-store.ts로 대체
├── guarded-wdk-factory.ts     # import 경로 변경 (ApprovalStore → WdkStore)
├── signed-approval-broker.ts  # import 경로 변경
├── guarded-middleware.ts       # import 경로 변경 (타입 참조)
├── index.ts                   # export 변경
└── store-types.ts             # CronRow 타입 유지 (daemon 참조용)
```

### 신규 생성 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts               # 신규 — WdkStore abstract class
├── sqlite-wdk-store.ts        # 신규 — SqliteApprovalStore에서 rename
└── json-wdk-store.ts          # 신규 — JsonApprovalStore에서 rename
```

### 테스트 파일
```
packages/guarded-wdk/tests/
├── sqlite-approval-store.test.ts  # rename → sqlite-wdk-store.test.ts
├── json-approval-store.test.ts    # rename → json-wdk-store.test.ts
├── approval-broker.test.ts        # MockApprovalStore → MockWdkStore 변경
├── factory.test.ts                # import 변경
└── integration.test.ts            # import 변경
```

### Side Effect 위험
- daemon 패키지의 import가 깨짐 → Step 05에서 해결 (이 step에서는 daemon 컴파일 실패 허용)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.ts | store 타입 참조 확인 → import type만 사용 중이면 리네임만 | ✅ OK |
| store-types.ts | CronRow 타입은 유지 (daemon 참조용) — 삭제 대상 아님 | ✅ OK |
| approval-broker.test.ts | MockApprovalStore가 WdkStore를 mock → 리네임 필요 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| signed-approval-broker.ts import 변경 | ✅ Scope에 있음 | OK |
| 테스트 5개 파일 업데이트 | ✅ 추가됨 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: DaemonStore 추출](step-02-daemonstore-extract.md)
