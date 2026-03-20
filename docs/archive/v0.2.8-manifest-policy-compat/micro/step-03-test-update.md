# Step 03: manifest 테스트 업데이트 + 통합 검증

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 (validatePolicies export), Step 02 (manifest 코드 변경)

---

## 1. 구현 내용 (design.md 기반)
- 테스트의 `'REQUIRE_APPROVAL'` → `'ALLOW'`, `'AUTO'` → `'ALLOW'` 또는 `'REJECT'`로 변경
- 기존 round-trip 테스트의 decision 값 수정
- 통합 검증 테스트 추가: `import { validatePolicies } from '@wdk-app/guarded-wdk'` → `manifestToPolicy()` 결과 검증
- constraints 관련 테스트 코드가 있다면 제거
- edge case 테스트: approve rule default decision === 'ALLOW'

## 2. 완료 조건
- [ ] `grep -E "REQUIRE_APPROVAL|AUTO" packages/manifest/tests/` 결과 0건 (F10)
- [ ] 통합 테스트에서 `import { validatePolicies } from '@wdk-app/guarded-wdk'` 사용 (F11)
- [ ] `grep 'guarded-middleware' packages/manifest/tests/` 결과 0건 (F11 — deep import 금지)
- [ ] `manifestToPolicy()` → `validatePolicies()` 통과 테스트 존재 (F3)
- [ ] `grep 'constraints' packages/manifest/tests/` 결과 0건 (placeholder 테스트 정리)
- [ ] manifest 테스트 전체 통과 (N2)
- [ ] E1: `decision: 'REJECT'` 전달 시 모든 Rule decision === 'REJECT' 테스트 존재
- [ ] E2: 기본값 decision === 'ALLOW' 테스트 존재 (기존 테스트 수정)
- [ ] E3: approval 없는 feature → `dict['*']` undefined 테스트 유지
- [ ] E4: 미지 chainId → `{}` 반환 테스트 유지
- [ ] E5: `features: []` → `{}` 반환 테스트 유지
- [ ] E6: approve rule default decision === 'ALLOW' 검증 테스트 존재

## 3. 롤백 방법
- `git revert` — 테스트 파일만 변경
- 영향 범위: 테스트만

---

## Scope

### 수정 대상 파일
```
packages/manifest/tests/
└── manifest-to-policy.test.ts  # 수정 - Decision 값 교체, 통합 테스트 추가, constraints 테스트 제거
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| @wdk-app/guarded-wdk | 새 import | validatePolicies public API 사용 |
| manifest src/* | 간접 | Step 02에서 변경된 코드를 테스트 |

### Side Effect 위험
없음 — 테스트 파일만 수정

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| manifest-to-policy.test.ts | Decision 값 교체, 통합 테스트 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Decision 값 교체 | ✅ test.ts | OK |
| 통합 검증 테스트 | ✅ test.ts | OK |
| approve rule E6 테스트 | ✅ test.ts | OK |

### 검증 통과: ✅
