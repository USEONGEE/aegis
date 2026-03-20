# Step 02: manifest 타입 통합

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료 (ArgCondition, Decision export 필요)

---

## 1. 구현 내용 (design.md Step 2-6)
- `package.json`: `@wdk-app/guarded-wdk` 의존 추가
- `types.ts`: `PolicyPermission`, `ManifestArgCondition`, `ManifestRule`, `ManifestPermissionDict` 정의 삭제. guarded-wdk에서 `ArgCondition`, `Rule`, `PermissionDict`, `Decision` import + re-export. `UserConfig.decision` 인라인 리터럴 → `Decision` 타입
- `manifest-to-policy.ts`: import 변경 (`ManifestPermissionDict` → `PermissionDict`, `ManifestRule` → `Rule`). 반환 타입 및 내부 변수 타입 변경
- `index.ts`: 삭제된 4개 타입 export 제거. guarded-wdk 타입 4개 re-export 추가
- `tests/manifest-to-policy.test.ts`: `ManifestPermissionDict` → `PermissionDict` 전체 치환

## 2. 완료 조건
- [ ] F3: `grep "guarded-wdk" packages/manifest/package.json` → 1건
- [ ] F4: `grep -c "interface ManifestArgCondition\|interface ManifestRule\|interface ManifestPermissionDict\|interface PolicyPermission" packages/manifest/src/types.ts` → 0건
- [ ] F5: `grep "from '@wdk-app/guarded-wdk'" packages/manifest/src/types.ts` → 1건
- [ ] F6 (covers E2): `grep "decision?: Decision" packages/manifest/src/types.ts` → 1건
- [ ] F7: `grep "): PermissionDict" packages/manifest/src/manifest-to-policy.ts` → 1건
- [ ] F8a: `grep "ArgCondition" packages/manifest/src/index.ts` → 1건
- [ ] F8b: `grep "Rule" packages/manifest/src/index.ts` → 1건 이상
- [ ] F8c: `grep "PermissionDict" packages/manifest/src/index.ts` → 1건
- [ ] F8d: `grep "Decision" packages/manifest/src/index.ts` → 1건
- [ ] F9: `grep -c "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/manifest/src/index.ts` → 0건
- [ ] N2 (covers E3, E4): `cd packages/manifest && node --experimental-vm-modules ../../node_modules/.bin/jest` → 15개 전수 통과
- [ ] N4 (covers E1): `cd packages/manifest && npx tsc --noEmit` → 에러 0건
- [ ] N5: `grep -r "@wdk-app/manifest" packages/guarded-wdk/` → 0건
- [ ] N6: `grep -rn "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/ --include="*.ts" --exclude-dir=node_modules` → 0건 (docs 제외)

## 3. 롤백 방법
- `git revert` — 단일 커밋 원자적 롤백
- Step 01은 additive이므로 Step 02만 롤백해도 안전

---

## Scope

### 수정 대상 파일
```
packages/manifest/
├── package.json                        # 수정 - guarded-wdk dependency 추가
├── src/
│   ├── types.ts                        # 수정 - 중복 타입 삭제 + guarded-wdk import/re-export
│   ├── manifest-to-policy.ts           # 수정 - import 및 타입 어노테이션 변경
│   └── index.ts                        # 수정 - export 목록 변경
└── tests/
    └── manifest-to-policy.test.ts      # 수정 - ManifestPermissionDict → PermissionDict
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| types.ts | 직접 수정 | 타입 정의 삭제 + import/re-export |
| manifest-to-policy.ts | 직접 수정 | 타입 참조 변경 |
| index.ts | 직접 수정 | public export 변경 |
| validate-manifest.ts | 간접 확인 | 삭제 대상 타입 사용 여부 확인 필요 |
| examples/aave-v3.ts | 영향 없음 | Manifest 타입만 사용 |

### Side Effect 위험
- **validate-manifest.ts**: 삭제 대상 타입을 참조하는지 확인 필요. 현재 분석 상 미사용이나 개발 시 재확인
- **Breaking change**: `ManifestRule`, `ManifestArgCondition`, `ManifestPermissionDict`, `PolicyPermission` public export 제거. 외부 소비자 없음 확인 완료

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| package.json | guarded-wdk dependency 추가 | ✅ OK |
| types.ts | 타입 삭제 + import/re-export | ✅ OK |
| manifest-to-policy.ts | 타입 참조 변경 | ✅ OK |
| index.ts | export 변경 | ✅ OK |
| manifest-to-policy.test.ts | 타입 이름 치환 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| dependency 추가 | ✅ package.json | OK |
| 타입 삭제 | ✅ types.ts | OK |
| import/re-export | ✅ types.ts | OK |
| UserConfig.decision 변경 | ✅ types.ts | OK |
| manifest-to-policy 타입 변경 | ✅ manifest-to-policy.ts | OK |
| index.ts export 변경 | ✅ index.ts | OK |
| 테스트 타입 치환 | ✅ test 파일 | OK |
| validate-manifest.ts 확인 | ✅ 간접 확인 | OK |

### 검증 통과: ✅

---

→ 완료: 최종 검증 (design.md Step 7)
