# Step 01: SignedPolicy → PolicyInput 분리

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md Step A)
- `SignedPolicy` → `PolicyInput { policies: unknown[], signature: Record<string, unknown> }` rename
- `StoredPolicy` extends 제거 → 독립 타입 (DB row 1:1)
- `savePolicy` 시그니처: `PolicyInput` 입력, store 내부에서 `JSON.stringify` 수행
- `index.ts`: `SignedPolicy` export → `PolicyInput` export
- factory, daemon에서 parsed form 직접 접근 → `JSON.parse(stored.policies_json)` 변경

## 2. 완료 조건
- [ ] `grep -rn 'SignedPolicy' packages/guarded-wdk/src/ packages/daemon/src/` — StoredPolicy 제외 0건 (DoD F1)
- [ ] `StoredPolicy`에 extends 없음 (DoD F2)
- [ ] json/sqlite store의 `savePolicy`에서 `JSON.stringify(input.policies)` 존재 (DoD F3)
- [ ] `grep -n 'PolicyInput' packages/guarded-wdk/src/index.ts` (DoD F10)
- [ ] store 테스트에서 빈 policies 배열 `savePolicy → loadPolicy` round-trip 통과 (DoD E1)
- [ ] `pnpm --filter guarded-wdk test` — 6 suites pass (DoD N1)
- [ ] daemon tsc baseline 유지 (DoD N2)

## 3. 롤백 방법
- `git revert <commit>` — 단일 커밋으로 원자적 변경

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts       # SignedPolicy → PolicyInput, StoredPolicy 독립화
├── json-approval-store.ts  # savePolicy: JSON.stringify 수행
├── sqlite-approval-store.ts # savePolicy: JSON.stringify 수행
├── guarded-wdk-factory.ts  # stored.policies → JSON.parse(stored.policies_json)
└── index.ts                # export 변경

packages/daemon/src/
├── wdk-host.ts             # savePolicy 호출 + stored.policies fallback 제거
└── tool-surface.ts         # policy?.policies → JSON.parse(policy.policies_json)

tests/
├── json-approval-store.test.ts  # savePolicy 입력 형태 변경
├── sqlite-approval-store.test.ts # 동일
├── factory.test.ts              # stored.policies 접근 변경
└── daemon/tests/tool-surface.test.ts # mock 변경
```

### Side Effect 위험
- factory.ts의 `stored.policies` 접근이 여러 곳에 있어 누락 가능 → tsc로 검출

### 참고할 기존 패턴
- `PendingApprovalRow → PendingApprovalRequest` 매핑 (json-approval-store.ts:140-148)

## FP/FN 검증

### False Positive (과잉)
| Scope 파일 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | PolicyInput/StoredPolicy 정의 | ✅ OK |
| json-approval-store.ts | savePolicy JSON.stringify | ✅ OK |
| sqlite-approval-store.ts | 동일 | ✅ OK |
| guarded-wdk-factory.ts | stored.policies → JSON.parse | ✅ OK |
| index.ts | PolicyInput export | ✅ OK |
| wdk-host.ts | savePolicy 호출 + fallback 제거 | ✅ OK |
| tool-surface.ts | policy.policies → JSON.parse | ✅ OK |
| factory.test.ts | stored.policies 접근 변경 | ✅ OK |
| tool-surface.test.ts | mock 변경 | ✅ OK |
| json-approval-store.test.ts | savePolicy 입력 변경 | ✅ OK |
| sqlite-approval-store.test.ts | 동일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| PolicyInput rename | ✅ | OK |
| StoredPolicy 독립화 | ✅ | OK |
| store 직렬화 | ✅ | OK |
| factory 접근 변경 | ✅ | OK |
| daemon 접근 변경 | ✅ | OK |
| 빈 배열 round-trip 테스트 | ✅ (store test) | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: JournalEntry 분리](step-02-journal-split.md)
