# 작업 티켓 - v0.2.3

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | guarded-wdk export 추가 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | manifest 타입 통합 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| manifest가 guarded-wdk 정책 타입 직접 참조 | Step 01, 02 | ✅ |
| manifest 내 중복 타입 제거 | Step 02 | ✅ |
| 미사용 타입(PolicyPermission) 제거 | Step 02 | ✅ |
| manifestToPolicy() 반환 타입 통일 | Step 02 | ✅ |
| guarded-wdk에서 ArgCondition, Decision export 추가 | Step 01 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1a: ArgCondition export | Step 01 | ✅ |
| F1b: Decision export | Step 01 | ✅ |
| F2: Decision export type | Step 01 | ✅ |
| F3: manifest dependency 추가 | Step 02 | ✅ |
| F4: 중복 타입 정의 제거 | Step 02 | ✅ |
| F5: guarded-wdk import/re-export | Step 02 | ✅ |
| F6: UserConfig.decision → Decision | Step 02 | ✅ |
| F7: manifestToPolicy() → PermissionDict | Step 02 | ✅ |
| F8a-F8d: manifest re-export | Step 02 | ✅ |
| F9: 삭제된 타입 export 제거 | Step 02 | ✅ |
| N1: guarded-wdk 테스트 통과 | Step 01 | ✅ |
| N2: manifest 테스트 통과 | Step 02 | ✅ |
| N3: guarded-wdk tsc 통과 | Step 01 | ✅ |
| N4: manifest tsc 통과 | Step 02 | ✅ |
| N5: 순환 의존 없음 | Step 02 | ✅ |
| N6: 소스에서 제거 대상 타입 0건 | Step 02 | ✅ |
| E1: 타입 컴파일 호환 | Step 02 | ✅ |
| E2: UserConfig.decision optional 유지 | Step 02 | ✅ |
| E3: unknown chainId → empty dict | Step 02 | ✅ |
| E4: approval 없는 feature | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| manifest → guarded-wdk 의존 추가 | Step 02 | ✅ |
| guarded-wdk ArgCondition, Decision export 추가 | Step 01 | ✅ |
| manifest에서 guarded-wdk 타입 re-export | Step 02 | ✅ |
| Breaking change (타입 이름 변경) | Step 02 | ✅ |
| Decision 하드코딩 → 타입 참조 | Step 02 | ✅ |

## Step 상세
- [Step 01: guarded-wdk export 추가](step-01-guarded-wdk-export.md)
- [Step 02: manifest 타입 통합](step-02-manifest-type-unify.md)
