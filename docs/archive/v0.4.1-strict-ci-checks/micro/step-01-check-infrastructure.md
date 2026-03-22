# Step 01: CI Check Infrastructure

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (신규 파일만 추가)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `scripts/check/shared/ast-source-files.ts` — getAstSourceFiles() 공유 유틸 구현
- `scripts/check/checks/cross/no-empty-catch.ts` — CatchClause AST 기반 체크
- `scripts/check/checks/cross/no-console.ts` — CallExpression AST 기반 체크
- `scripts/check/checks/cross/no-explicit-any.ts` — AnyKeyword AST 기반 체크
- `scripts/check/__fixtures__/empty-catch-sample.ts` — empty catch fixture
- `scripts/check/__fixtures__/console-usage-sample.ts` — console fixture
- `scripts/check/__fixtures__/explicit-any-sample.ts` — explicit any fixture
- `scripts/check/registry.ts` — 3개 체크 cross group 등록

## 2. 완료 조건
- [ ] getAstSourceFiles()가 ts-morph Project 기반으로 first-party 소스 파일을 수집한다
- [ ] getAstSourceFiles()가 tests/, dist/, node_modules/, __fixtures__/ 경로를 제외한다 (F15)
- [ ] no-empty-catch가 CatchClause → Block.getStatements().length === 0 으로 판별한다
- [ ] no-console이 CallExpression → console.* PropertyAccessExpression으로 판별한다 (bracket notation 비감지 — E10)
- [ ] no-explicit-any가 AnyKeyword SyntaxKind로 판별하고 부모 컨텍스트별 메시지를 생성한다
- [ ] no-empty-catch, no-console은 전체 7개 패키지 tsconfig을 스캔한다 (F10)
- [ ] no-explicit-any는 daemon, relay, app, manifest 4개 패키지만 스캔한다 (F11)
- [ ] .tsx 파일이 스캔 대상에 포함된다 (F12)
- [ ] fixture 3개에 위반/비위반 패턴이 모두 포함되어 있다 (F13)
- [ ] registry.ts에 3개 체크가 cross group으로 등록되어 있다 (F4)
- [ ] 3개 체크 모두 기존 위반을 정확히 감지한다 (violations > 0)
- [ ] 3개 체크가 CheckResult/Violation 인터페이스를 준수한다 (N3)

## 3. 롤백 방법
- 신규 파일 삭제 + registry.ts에서 3개 entry 제거

---

## Scope

### 신규 생성 파일
```
scripts/check/
├── shared/ast-source-files.ts     # 신규 — getAstSourceFiles() 공유 유틸
├── checks/cross/
│   ├── no-empty-catch.ts          # 신규 — CatchClause 체크
│   ├── no-console.ts              # 신규 — console.* 체크
│   └── no-explicit-any.ts         # 신규 — AnyKeyword 체크
└── __fixtures__/
    ├── empty-catch-sample.ts      # 신규
    ├── console-usage-sample.ts    # 신규
    └── explicit-any-sample.ts     # 신규
```

### 수정 대상 파일
```
scripts/check/registry.ts          # 수정 — 3개 체크 등록
```

### 참고할 기존 패턴
- `scripts/check/shared/restricted-usage.ts` — getDescendantsOfKind 패턴
- `scripts/check/checks/cross/dead-exports.ts` — ts-morph Project 기반 파일 수집

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ast-source-files.ts | F9, F15 getAstSourceFiles 유틸 | ✅ OK |
| no-empty-catch.ts | F1, F6 체크 구현 | ✅ OK |
| no-console.ts | F2, F7 체크 구현 | ✅ OK |
| no-explicit-any.ts | F3, F8 체크 구현 | ✅ OK |
| fixture 3개 | F13 fixture 요구 | ✅ OK |
| registry.ts | F4 등록 요구 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 공유 유틸 | ✅ ast-source-files.ts | OK |
| 3개 체크 | ✅ checks/cross/*.ts | OK |
| fixture | ✅ __fixtures__/*.ts | OK |
| registry | ✅ registry.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: Empty Catch 위반 수정](step-02-fix-empty-catch.md)
