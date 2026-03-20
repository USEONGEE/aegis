# Step 01: guarded-wdk ArgCondition/Decision export 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md Step 1)
- `guarded-middleware.ts`: `type Decision` → `export type Decision`
- `index.ts`: export 목록에 `ArgCondition`, `Decision` 추가

## 2. 완료 조건
- [ ] F2: `grep "export type Decision" packages/guarded-wdk/src/guarded-middleware.ts` → 1건
- [ ] F1a: `grep "ArgCondition" packages/guarded-wdk/src/index.ts` → 1건
- [ ] F1b: `grep "Decision" packages/guarded-wdk/src/index.ts` → 1건
- [ ] N1: `cd packages/guarded-wdk && node --experimental-vm-modules ../../node_modules/.bin/jest` → 전수 통과
- [ ] N3: `cd packages/guarded-wdk && npx tsc --noEmit` → 에러 0건

## 3. 롤백 방법
- `git revert` — additive change이므로 롤백 시 부작용 없음

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/
├── src/guarded-middleware.ts  # 수정 - Decision에 export 키워드 추가
└── src/index.ts               # 수정 - ArgCondition, Decision export 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| guarded-middleware.ts | 직접 수정 | Decision export 추가 |
| index.ts | 직접 수정 | re-export 추가 |

### Side Effect 위험
없음 — additive export only. 기존 import에 영향 없음.

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.ts | Decision export 추가 | ✅ OK |
| index.ts | ArgCondition, Decision re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Decision export 변경 | ✅ guarded-middleware.ts | OK |
| ArgCondition re-export | ✅ index.ts | OK |
| Decision re-export | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: manifest 타입 통합](step-02-manifest-type-unify.md)
