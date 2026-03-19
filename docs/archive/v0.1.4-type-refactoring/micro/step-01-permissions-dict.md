# Step 01: permissions 딕셔너리 (Change 8)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `Permission` 인터페이스 → `Rule` 인터페이스 (order, args, valueLimit, decision)
- `CallPolicy.permissions: Permission[]` → `CallPolicy.permissions: PermissionDict`
- `PermissionDict` 타입 정의: `{ [target]: { [selector]: Rule[] } }`
- `permissionsToDict()` 변환 함수 작성
- `evaluatePolicy()` 내부 매칭 알고리즘 변경: 후보 수집 → order 정렬 → 첫 매칭
- `manifestToPolicy()` 반환 타입을 `PermissionDict`으로 변경

## 2. 완료 조건
- [ ] `grep -r 'permissions: Permission\[\]' packages/` 결과 0건
- [ ] `Rule` 인터페이스에 `order: number` 필드 존재
- [ ] evaluate-policy.test.ts에서 wildcard+specific 혼합 순서 보존 테스트 통과
- [ ] manifest-to-policy.test.ts 통과 (PermissionDict 반환)
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert (단일 커밋으로 관리)
- 영향: guarded-wdk evaluatePolicy + manifest manifestToPolicy + 관련 테스트

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts          # Permission → Rule, CallPolicy.permissions 타입 변경
├── guarded-middleware.ts       # evaluatePolicy() 매칭 알고리즘 변경
└── guarded-wdk-factory.ts     # validatePolicies() 변경 (Permission[] → PermissionDict)

packages/manifest/src/
└── manifest-to-policy.ts      # 반환 타입 PermissionDict, 빌드 로직 변경

packages/guarded-wdk/tests/
├── evaluate-policy.test.ts    # Permission[] → PermissionDict 구성
└── integration.test.ts        # policy fixture 변경

packages/manifest/tests/
└── manifest-to-policy.test.ts # 반환값 검증 변경
```

### Side Effect 위험
- evaluatePolicy의 매칭 결과가 바뀔 수 있음 → Rule.order로 방지

## FP/FN 검증

### 검증 통과: ✅
- 모든 Scope 파일이 구현 내용과 연결됨
- approval-verifier.ts는 Permission을 직접 사용하지 않으므로 제외 (OK)

---

> 다음: [Step 02: chainId number](step-02-chainid-number.md)
