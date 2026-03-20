# 설계 - v0.2.8

## 변경 규모
**규모**: 일반 기능
**근거**: 2개 패키지 수정 (manifest + guarded-wdk), 내부 API/타입 스키마 변경 (Feature에서 constraints 제거, UserConfig 축소)

---

## 문제 요약
manifest 패키지가 guarded-wdk v0.2.5의 Decision 단순화(`ALLOW | REJECT`)에 동기화되지 않아 tsc 빌드 실패 + 런타임 호환 불가. 미사용 placeholder(constraints, tokenAddresses, userAddress)도 정리 필요.

> 상세: [README.md](README.md) 참조

## 접근법
**직접 동기화 + dead code 제거**. manifest 패키지의 타입/코드/테스트를 guarded-wdk의 현재 계약에 맞추고, 미구현 placeholder를 public API에서 완전 제거한다.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: manifest를 guarded-wdk에 직접 동기화 | 가장 단순, 즉시 빌드 복원, dead code 제거 | 없음 (현재 외부 소비자 없음) | ✅ |
| B: guarded-wdk에 Decision 확장 (REQUIRE_APPROVAL 복원) | manifest 변경 불필요 | v0.2.5 단순화 목적에 역행, 불필요한 복잡성 재도입 | ❌ |
| C: manifest에 Decision 매핑 레이어 추가 | 양쪽 독립 유지 | No Backward Compatibility 원칙 위반, shim 코드 | ❌ |

**선택 이유**: A가 프로젝트 원칙(Breaking change 허용, No Backward Compatibility, Primitive First)에 완벽히 부합. manifest의 외부 소비자가 없으므로 breaking change 비용 zero.

## 기술 결정

### 1. Decision 기본값 변경
- `manifestToPolicy()`의 기본 decision: `'REQUIRE_APPROVAL'` → `'ALLOW'`
- 의미: manifest에서 명시적으로 허용된 call은 기본 ALLOW. 거부는 명시적으로 REJECT 지정

### 2. placeholder 필드 완전 제거 (Breaking change)

| 제거 대상 | 위치 | 이유 |
|-----------|------|------|
| `Feature.constraints` | types.ts, validate-manifest.ts, examples, tests | 미구현 — manifestToPolicy()에서 무시됨 |
| `Constraint` 인터페이스 | types.ts, index.ts export | constraints 제거에 따라 불필요 |
| `UserConfig.tokenAddresses` | types.ts | 미사용 — destructure만 하고 사용 안 함 |
| `UserConfig.userAddress` | types.ts | 미사용 — destructure만 하고 사용 안 함 |

### 3. guarded-wdk에서 `validatePolicies` export 추가
- 현재: `validatePolicies`는 guarded-middleware.ts에서 정의, guarded-wdk-factory.ts에서만 내부 사용
- 변경: `packages/guarded-wdk/src/index.ts`에서 re-export
- 이유: manifest 테스트에서 통합 검증 시 필요. direct path import(`guarded-middleware.js`)보다 public API 사용이 정석

### 4. 통합 검증 테스트 추가
- manifest 테스트에 `validatePolicies()`를 사용하는 검증 추가
- `manifestToPolicy()` → `{ type: 'call', permissions: dict }` → `validatePolicies()` 통과 확인
- 허위 양성 방지: guarded-wdk의 실제 validation 경로를 타야 함

---

## 범위 / 비범위

**범위 (In Scope)**:
- `packages/manifest/src/types.ts` — Decision 동기화, constraints/tokenAddresses/userAddress 제거
- `packages/manifest/src/manifest-to-policy.ts` — 기본 decision 변경, 미사용 destructure 제거
- `packages/manifest/src/validate-manifest.ts` — constraints 검증 코드 제거
- `packages/manifest/src/examples/aave-v3.ts` — constraints 필드 제거
- `packages/manifest/src/index.ts` — Constraint export 제거
- `packages/manifest/tests/manifest-to-policy.test.ts` — Decision 값 수정, 통합 검증 추가
- `packages/guarded-wdk/src/index.ts` — validatePolicies export 추가

**비범위 (Out of Scope)**:
- guarded-wdk 내부 로직 변경
- 새 manifest example 추가
- daemon 패키지 변경 (manifest 미사용 확인 완료)

## 아키텍처 개요

```
변경 전:
  manifest types.ts ←import── guarded-wdk (Decision = 'ALLOW'|'REJECT')
  manifest-to-policy.ts: decision = 'REQUIRE_APPROVAL' ← 타입 불일치!
  manifest tests: 'AUTO', 'REQUIRE_APPROVAL' ← 검증 경로 분리

변경 후:
  manifest types.ts ←import── guarded-wdk (Decision = 'ALLOW'|'REJECT')
  manifest-to-policy.ts: decision = 'ALLOW' ← 타입 일치
  manifest tests: 'ALLOW', 'REJECT' + validatePolicies() 통합 검증
```

## API/인터페이스 계약 변경

### Feature (Breaking)
```typescript
// Before
interface Feature {
  id: string
  name: string
  description: string
  calls: Call[]
  approvals: Approval[]
  constraints: Constraint[]  // ← 제거
}

// After
interface Feature {
  id: string
  name: string
  description: string
  calls: Call[]
  approvals: Approval[]
}
```

### UserConfig (Breaking)
```typescript
// Before
interface UserConfig {
  features?: string[]
  decision?: Decision
  argsConditions?: Record<string, string>
  tokenAddresses?: Record<string, string>  // ← 제거
  userAddress?: string                      // ← 제거
}

// After
interface UserConfig {
  features?: string[]
  decision?: Decision
  argsConditions?: Record<string, string>
}
```

### guarded-wdk index.ts (추가)
```typescript
// 추가 export
export { validatePolicies } from './guarded-middleware.js'
```

## 테스트 전략

- **단위 테스트**: 기존 manifest-to-policy.test.ts 수정 — Decision 값을 `'ALLOW'`/`'REJECT'`로 교체
- **통합 테스트**: 새 test case 추가 — `manifestToPolicy()` 결과를 `validatePolicies()` 경로에 직접 넣어 guarded-wdk 호환성 검증
- **빌드 검증**: `npx tsc -p packages/manifest/tsconfig.json --noEmit` 통과 확인

## 리스크/오픈 이슈
- **리스크 없음**: manifest의 외부 소비자가 현재 없으므로 breaking change 영향 zero
- Codex Step 1 리뷰에서 지적한 `validatePolicies` export 경로 문제는 위 기술 결정 #3으로 해결
