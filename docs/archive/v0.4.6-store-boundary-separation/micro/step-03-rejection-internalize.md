# Step 03: Rejection 내부화

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (콜백 추가/제거만)
- **선행 조건**: Step 01 (WdkStore 존재)

---

## 1. 구현 내용 (design.md 섹션 4.1)

- `guarded-middleware.ts` MiddlewareConfig에 `onRejection` + `getPolicyVersion` 콜백 추가
- sendTransaction/transfer/signTransaction 래퍼에서 REJECT 시 `onRejection` 콜백 호출 (best-effort)
- `PolicyRejectionError` 클래스에 `intentHash` 필드 추가
- `guarded-wdk-factory.ts`에서 middleware config에 콜백 연결 (store.saveRejection, store.getPolicyVersion)
- `daemon/tool-surface.ts`에서 rejection 저장 코드 3곳 전체 제거 (sendTransaction, transfer, signTransaction catch)
- `ToolStorePort`에서 `saveRejection`, `getPolicyVersion` 제거
- `@wdk-app/canonical`에 `dedupKey()` 함수 추가
- 데이터 모델: `targetHash` → `dedupKey` rename (RejectionEntry, SQLite 컬럼)

## 2. 완료 조건
- [ ] guarded-wdk 테스트: REJECT 판정 시 `onRejection` 콜백 호출 확인
- [ ] guarded-wdk 테스트: `onRejection` 실패해도 `PolicyRejectionError` 정상 throw
- [ ] guarded-wdk 테스트: `PolicyRejectionError.intentHash` 가 non-empty string
- [ ] `grep -n "saveRejection\|getPolicyVersion" packages/daemon/src/tool-surface.ts` 결과 0건
- [ ] `grep "export function dedupKey" packages/canonical/src/index.ts` 결과 1건
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 성공
- [ ] `npx tsc -p packages/canonical/tsconfig.json --noEmit` 성공
- [ ] DoD: F5, F6, F9, F14, E1

## 3. 롤백 방법
- git revert — 콜백 추가/제거이므로 기존 코드 복원 단순

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-middleware.ts       # MiddlewareConfig에 onRejection/getPolicyVersion 추가, 래퍼 수정
├── guarded-wdk-factory.ts     # middleware config에 콜백 연결
├── errors.ts                  # PolicyRejectionError에 intentHash 추가 (또는 신규)
├── approval-store.ts (→ wdk-store.ts)  # RejectionEntry 타입에서 targetHash→dedupKey
├── sqlite-wdk-store.ts        # rejection_history 컬럼 target_hash→dedup_key
└── json-wdk-store.ts          # rejection JSON 키 변경

packages/canonical/src/
└── index.ts                   # dedupKey() 함수 추가

packages/daemon/src/
├── tool-surface.ts            # rejection 저장 코드 3곳 제거
└── ports.ts                   # ToolStorePort에서 saveRejection/getPolicyVersion 제거
```

### 테스트 파일
```
packages/guarded-wdk/tests/
├── integration.test.ts            # rejection 내부 기록 검증 추가
└── sqlite-wdk-store.test.ts       # rejection 컬럼 rename 반영

packages/daemon/tests/
└── tool-surface.test.ts           # rejection mock 제거 반영

packages/canonical/tests/
└── canonical.test.ts              # dedupKey() 함수 테스트 추가
```

### Side Effect 위험
- **중간**: middleware 동작 변경 — rejection 기록 누락 가능성. best-effort + PolicyRejectionError는 항상 throw로 완화

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| signed-approval-broker.ts | rejection과 무관, 이 step에서 수정 불필요 | ❌ FP → Scope에서 제거 (이미 미포함) |
| store-types.ts | RejectionEntry 타입 변경 필요 → wdk-store.ts에 통합 예정 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| PolicyRejectionError 확장 | ✅ errors.ts | OK |
| dedupKey() 함수 | ✅ canonical/index.ts | OK |
| daemon rejection 제거 | ✅ tool-surface.ts, ports.ts | OK |
| 테스트 파일 4개 | ✅ 추가됨 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: Journal 내부화](step-04-journal-internalize.md)
