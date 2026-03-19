# Step 08: signTransaction 분리 (Change 6)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 05

---

## 1. 구현 내용 (design.md 기반)
- guarded-middleware.ts: GuardedAccount에 `signTransaction()` 메서드 추가
  - evaluatePolicy (기존 로직 재사용)
  - approval flow (기존 로직 재사용)
  - rawAccount.signTransaction/sign → signedTx 반환
  - 'TransactionSigned' 이벤트 emit
- `SignTransactionResult` 타입: { signedTx, intentHash, requestId, intentId }
- ExecutionJournal: `signed` 상태 추가 (received → evaluated → approved → signed → broadcasted → settled | failed)
- daemon tool-surface: signTransaction 도구 정의 + executeToolCall 처리
- daemon wdk-host: WDKInstance.signTransaction() 메서드

## 2. 완료 조건
- [ ] integration.test.ts: signTransaction 호출 → signedTx 반환 테스트 통과
- [ ] integration.test.ts: signTransaction REQUIRE_APPROVAL 테스트 통과
- [ ] tool-surface.test.ts: signTransaction 도구 테스트 통과
- [ ] tool-surface.test.ts: signTransaction duplicate 테스트 통과
- [ ] `grep -n "'signed'" packages/daemon/src/execution-journal.ts` 결과 1건 이상
- [ ] `npm test` 전체 통과
- [ ] **최종 검증 (Phase 마지막 Step):**
- [ ] `for pkg in canonical guarded-wdk manifest daemon; do npx tsc --noEmit -p packages/$pkg/tsconfig.json; done` 전체 exit 0
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` exit 0
- [ ] `npx tsx scripts/check/index.ts` FAIL 0건
- [ ] `npm run type-graph:json` 실행 완료

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk + daemon

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts        # signTransaction 메서드 추가
└── approval-store.ts            # SignTransactionResult 타입 (또는 별도 파일)

packages/daemon/src/
├── tool-surface.ts              # signTransaction 도구 정의 + 처리
├── execution-journal.ts         # 'signed' 상태 추가
└── wdk-host.ts                  # WDKInstance.signTransaction()

packages/guarded-wdk/tests/
└── integration.test.ts          # signTransaction 테스트 추가

packages/daemon/tests/
└── tool-surface.test.ts         # signTransaction 도구 테스트 추가
```

## FP/FN 검증

### 검증 통과: ✅

---

> Phase 완료 후: CI 체크 + type-dep-graph 재생성
