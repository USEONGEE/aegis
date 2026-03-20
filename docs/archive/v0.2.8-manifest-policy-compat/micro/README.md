# 작업 티켓 - v0.2.8

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | guarded-wdk validatePolicies export | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | manifest 타입 + 코드 동기화 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | manifest 테스트 업데이트 + 통합 검증 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 ─┐
    ├─→ 03
02 ─┘
```
- Step 01, 02는 독립 (병렬 가능)
- Step 03은 Step 01 + 02 완료 후 실행

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. tsc 빌드 복원 | Step 02 | ✅ |
| 2. Decision 값 호환 | Step 02, 03 | ✅ |
| 3. validatePolicies() 통과 | Step 01, 03 | ✅ |
| 4. placeholder 완전 제거 | Step 02, 03 (테스트 코드 정리) | ✅ |
| 5. 통합 검증 테스트 추가 | Step 01, 03 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 (tsc 빌드) | Step 02 | ✅ |
| F2 (기본 decision ALLOW) | Step 02 | ✅ |
| F3 (validatePolicies 통합) | Step 01, 03 | ✅ |
| F4 (Feature.constraints 제거) | Step 02 | ✅ |
| F5a (Constraint interface 삭제) | Step 02 | ✅ |
| F5b (Constraint export 삭제) | Step 02 | ✅ |
| F6 (tokenAddresses/userAddress 제거) | Step 02 | ✅ |
| F7 (validator constraints 제거) | Step 02 | ✅ |
| F8 (aave-v3 constraints 제거) | Step 02 | ✅ |
| F9 (validatePolicies export) | Step 01 | ✅ |
| F10 (테스트 Decision 값) | Step 03 | ✅ |
| F11 (public API import) | Step 03 | ✅ |
| N1 (tsc strict) | Step 02 | ✅ |
| N2 (manifest 테스트) | Step 03 | ✅ |
| N3 (guarded-wdk 회귀) | Step 01 | ✅ |
| E1 (REJECT 전달) | Step 03 (신규 테스트) | ✅ |
| E2 (기본값 ALLOW) | Step 03 (기존 테스트 수정) | ✅ |
| E3 (approval 없는 feature) | Step 03 (기존 테스트 유지) | ✅ |
| E4 (존재하지 않는 chainId) | Step 03 (기존 테스트 유지) | ✅ |
| E5 (빈 features 배열) | Step 03 (기존 테스트 유지) | ✅ |
| E6 (approve rule default) | Step 03 (신규 검증 추가) | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| 기본 decision → 'ALLOW' | Step 02, 03 | ✅ |
| placeholder 완전 제거 | Step 02, 03 (테스트 코드 정리) | ✅ |
| validatePolicies public export | Step 01 | ✅ |
| 통합 검증 테스트 (public API) | Step 01, 03 | ✅ |

## Step 상세
- [Step 01: guarded-wdk validatePolicies export](step-01-guarded-wdk-export.md)
- [Step 02: manifest 타입 + 코드 동기화](step-02-manifest-sync.md)
- [Step 03: manifest 테스트 업데이트 + 통합 검증](step-03-test-update.md)
