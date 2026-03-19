# Step 18: ChainPolicies → store 캐시 통합

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 08

---

## 1. 구현 내용 (design.md 기반)
- `guarded-wdk-factory.ts` 수정:
  - boot: `store.loadPolicy(seedId, chain)` → 메모리 캐시 hydrate
  - `updatePolicies()`: `store.savePolicy()` → 메모리 캐시 갱신 (write-through)
  - `ChainPolicies` 타입은 factory 내부 캐시로만 사용
- `createGuardedWDK()`의 `policies` 파라미터: required → optional로 격하
  - store에 policy가 있으면 store 우선
  - store가 비어있을 때만 `policies` 파라미터 사용
- ApprovalStore가 policy의 단일 source of truth

## 2. 완료 조건
- [ ] `createGuardedWDK()`의 `policies` 파라미터가 optional
- [ ] boot 시 `store.loadPolicy()` → 메모리 캐시 hydrate 코드 존재
- [ ] `updatePolicies()` 시 `store.savePolicy()` 호출 후 메모리 갱신 코드 존재
- [ ] store에 policy 존재 시 `policies` 파라미터 무시 테스트 통과
- [ ] write-through 테스트: updatePolicies → store에 저장 확인
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk 패키지만 (guarded-wdk-factory)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── guarded-wdk-factory.ts      # policies optional, boot hydrate, write-through

packages/guarded-wdk/tests/
└── integration.test.ts         # store 우선 + write-through 테스트 추가
```

### Side Effect 위험
- `policies` 파라미터가 optional로 변경되므로 기존 호출부 컴파일 에러 없음 (optional이므로)
- daemon wdk-host가 policies를 전달하는 경우: store가 비어있을 때만 사용됨

## FP/FN 검증

### 검증 통과: ✅
- daemon wdk-host는 Step 08에서 store 기반 restore를 구현하므로 정합 (OK)
- manifest는 policy 생성 시점에만 관여하므로 제외 (OK)

---

> Phase 완료 후: 전체 Gap 해소 검증 + CI 체크 + type-dep-graph 재생성
