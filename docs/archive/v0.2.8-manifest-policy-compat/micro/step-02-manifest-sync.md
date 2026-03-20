# Step 02: manifest 타입 + 코드 동기화

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음 (Step 01과 독립)

---

## 1. 구현 내용 (design.md 기반)
- `types.ts`: Feature에서 `constraints` 필드 제거, `Constraint` 인터페이스 삭제, UserConfig에서 `tokenAddresses`/`userAddress` 제거
- `index.ts`: `Constraint` export 제거
- `manifest-to-policy.ts`: 기본 decision `'REQUIRE_APPROVAL'` → `'ALLOW'`, UserConfig destructure에서 `tokenAddresses`/`userAddress` 제거
- `validate-manifest.ts`: constraints 검증 코드 제거
- `examples/aave-v3.ts`: constraints 필드 제거

## 2. 완료 조건
- [ ] `npx tsc -p packages/manifest/tsconfig.json --noEmit` exit 0 (F1, N1)
- [ ] `grep -r 'constraints' packages/manifest/src/` 결과 0건 (F4, F7, F8)
- [ ] `grep 'Constraint' packages/manifest/src/types.ts` 결과 0건 (F5a)
- [ ] `grep 'Constraint' packages/manifest/src/index.ts` 결과 0건 (F5b)
- [ ] `grep -r 'tokenAddresses\|userAddress' packages/manifest/src/` 결과 0건 (F6)
- [ ] `manifestToPolicy()` 기본 decision이 `'ALLOW'` (F2)

## 3. 롤백 방법
- `git revert` — 모든 변경이 manifest 패키지 내부
- 영향 범위: manifest 패키지만

---

## Scope

### 수정 대상 파일
```
packages/manifest/src/
├── types.ts              # 수정 - Constraint 삭제, Feature.constraints 제거, UserConfig 축소
├── index.ts              # 수정 - Constraint export 제거
├── manifest-to-policy.ts # 수정 - 기본 decision 변경, destructure 정리
├── validate-manifest.ts  # 수정 - constraints 검증 코드 제거
└── examples/
    └── aave-v3.ts        # 수정 - constraints 필드 제거
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| types.ts | 직접 수정 | Feature, UserConfig, Constraint 변경 |
| manifest-to-policy.ts | 직접 수정 | types.ts 의존 — Feature/UserConfig 변경 반영 |
| validate-manifest.ts | 직접 수정 | types.ts 의존 — Feature 변경 반영 |
| examples/aave-v3.ts | 직접 수정 | types.ts 의존 — Feature 변경 반영 |
| index.ts | 직접 수정 | Constraint re-export 제거 |

### Side Effect 위험
- manifest의 외부 소비자 없음 확인 완료 (daemon에서 미사용)
- Breaking change이지만 영향 zero

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.ts | Constraint 삭제, Feature/UserConfig 축소 | ✅ OK |
| index.ts | Constraint export 제거 | ✅ OK |
| manifest-to-policy.ts | Decision 기본값 + destructure 정리 | ✅ OK |
| validate-manifest.ts | constraints 검증 제거 | ✅ OK |
| aave-v3.ts | constraints 필드 제거 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Constraint 인터페이스 삭제 | ✅ types.ts | OK |
| Feature.constraints 제거 | ✅ types.ts, validate-manifest.ts, aave-v3.ts | OK |
| UserConfig 축소 | ✅ types.ts, manifest-to-policy.ts | OK |
| Decision 기본값 변경 | ✅ manifest-to-policy.ts | OK |
| Constraint export 제거 | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: manifest 테스트 업데이트](step-03-test-update.md)
