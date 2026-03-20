# Step 01: guarded-wdk validatePolicies export 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (export 라인 제거)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `packages/guarded-wdk/src/index.ts`에 `validatePolicies` re-export 추가
- 기존 내부 함수를 public API로 노출

## 2. 완료 조건
- [ ] `grep 'validatePolicies' packages/guarded-wdk/src/index.ts` 매치 (F9)
- [ ] guarded-wdk 기존 테스트 회귀 없음 (N3)

## 3. 롤백 방법
- index.ts에서 추가한 export 라인 삭제
- 영향 범위: 없음 (기존 코드에 변경 없음)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── index.ts  # 수정 - validatePolicies export 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| guarded-middleware.ts | 소스 | validatePolicies 정의 위치 (변경 없음) |
| guarded-wdk-factory.ts | 기존 소비자 | 내부 import 유지 (변경 없음) |

### Side Effect 위험
없음 — export 추가만으로 기존 동작에 영향 없음

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| index.ts | validatePolicies export 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| validatePolicies export | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: manifest 타입 + 코드 동기화](step-02-manifest-sync.md)
