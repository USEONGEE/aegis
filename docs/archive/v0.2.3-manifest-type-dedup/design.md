# 설계 - v0.2.3

## 변경 규모
**규모**: 일반 기능
**근거**: 2개 패키지 수정 (guarded-wdk, manifest), 내부 API 변경 (manifest public type export 변경)

---

## 문제 요약
manifest와 guarded-wdk에 구조적으로 동일한 정책 타입이 독립 정의되어 있어 타입 드리프트 위험. manifest가 guarded-wdk 타입을 직접 참조하도록 변경.

> 상세: [README.md](README.md) 참조

## 접근법
manifest가 guarded-wdk의 정책 타입(`ArgCondition`, `Rule`, `PermissionDict`, `Decision`)을 직접 import하고, 중복 타입 4개 + 미사용 타입 1개를 삭제한다. manifest는 guarded-wdk 타입을 re-export하여 소비자가 `@wdk-app/manifest`에서 계속 import 가능하게 한다.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: manifest → guarded-wdk 참조 + re-export | 단일 소스, 소비자 import 경로 유지 | manifest가 guarded-wdk에 의존 추가 | ✅ |
| B: 공통 타입을 canonical로 추출 | 양쪽 모두 canonical 참조 | canonical 역할 확대 (해시/직렬화 → 정책 타입), 과잉 추상화 | ❌ |
| C: manifest 타입 유지 + guarded-wdk 타입과 수동 동기화 | 의존 추가 없음 | 드리프트 문제 미해결, 이중 유지보수 지속 | ❌ |

**선택 이유**: A는 guarded-wdk가 정책 타입의 원천(source of truth)이므로 자연스러운 의존 방향. canonical은 해시/직렬화 유틸리티로 역할이 명확하여 정책 타입을 넣기 부적절.

## 기술 결정
- manifest → guarded-wdk 의존 추가 (단방향, "No Two-Way Implements" 준수)
- guarded-wdk에서 `ArgCondition`, `Decision` public export 추가 (additive change)
- manifest에서 guarded-wdk 타입을 re-export (소비자 import 경로 유지)
- Breaking change: `ManifestRule` → `Rule`, `ManifestArgCondition` → `ArgCondition`, `ManifestPermissionDict` → `PermissionDict` 이름 변경

---

## 범위 / 비범위
- **범위(In Scope)**: 타입 중복 제거, 의존 방향 정리, public export 변경
- **비범위(Out of Scope)**: optional 필드 정리 (별도 Phase), manifestToPolicy() 로직 변경, Manifest/Feature/Call 등 프로토콜 선언 타입

## API/인터페이스 계약

### Before → After import 매핑

| Before (제거됨) | After (대체) | import 경로 |
|-----------------|-------------|------------|
| `ManifestArgCondition` | `ArgCondition` | `@wdk-app/manifest` (re-export) |
| `ManifestRule` | `Rule` | `@wdk-app/manifest` (re-export) |
| `ManifestPermissionDict` | `PermissionDict` | `@wdk-app/manifest` (re-export) |
| `PolicyPermission` | (삭제, 대체 없음) | - |
| (없음) | `Decision` | `@wdk-app/manifest` (re-export) |

### manifestToPolicy() 시그니처 변경

```ts
// Before
function manifestToPolicy(manifest: Manifest, chainId: number, userConfig?: UserConfig): ManifestPermissionDict

// After
function manifestToPolicy(manifest: Manifest, chainId: number, userConfig?: UserConfig): PermissionDict
```

## 아키텍처 개요

N/A: 아키텍처 변경 없음. 의존 방향 추가만 발생 (manifest → guarded-wdk).

## 테스트 전략
- guarded-wdk 기존 테스트 스위트 — export 추가가 기존 동작에 영향 없음 확인
- manifest 기존 테스트 스위트 (15개 테스트) — 타입 이름 변경 후 전수 통과 확인
- 수동 검증: `grep -r "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/` 결과 0건

---

## 현재 상태 분석

### 타입 중복 매핑

| manifest 타입 | guarded-wdk 타입 | 위치 | 구조 일치 |
|---|---|---|---|
| `ManifestArgCondition` | `ArgCondition` | `guarded-middleware.ts:11-14` | 완전 동일 |
| `ManifestRule` | `Rule` | `guarded-middleware.ts:16-21` | 완전 동일 |
| `ManifestPermissionDict` | `PermissionDict` | `guarded-middleware.ts:23-27` | 완전 동일 |
| `'AUTO' \| 'REQUIRE_APPROVAL' \| 'REJECT'` (인라인) | `Decision` (type alias) | `guarded-middleware.ts:9` | 완전 동일 |

### guarded-wdk export 현황

| 타입 | `guarded-middleware.ts` 정의 | `index.ts` export | 조치 필요 |
|---|---|---|---|
| `Rule` | `export interface` | export됨 | 없음 |
| `PermissionDict` | `export interface` | export됨 | 없음 |
| `ArgCondition` | `export interface` | **export 안 됨** | export 추가 |
| `Decision` | `type` (non-exported) | **export 안 됨** | `export type` 변경 + index export 추가 |

### 영향 받는 파일 목록

| 파일 | 변경 유형 | 영향 |
|---|---|---|
| `packages/guarded-wdk/src/guarded-middleware.ts` | `Decision` export 추가 | line 9: `type` -> `export type` |
| `packages/guarded-wdk/src/index.ts` | `ArgCondition`, `Decision` export 추가 | export 목록에 2개 추가 |
| `packages/manifest/package.json` | dependency 추가 | `@wdk-app/guarded-wdk` 의존 추가 |
| `packages/manifest/src/types.ts` | 타입 삭제 + import 추가 | 5개 타입 정의 제거, 2개 re-export |
| `packages/manifest/src/manifest-to-policy.ts` | import 경로 변경 | import 대상 변경 |
| `packages/manifest/src/index.ts` | export 변경 | 삭제된 타입 export 제거, re-export 추가 |
| `packages/manifest/tests/manifest-to-policy.test.ts` | import 경로 변경 | `ManifestPermissionDict` -> `PermissionDict` |

### 외부 소비자 확인

- **daemon 패키지**: manifest 타입(`ManifestRule`, `ManifestArgCondition`, `ManifestPermissionDict`)을 직접 import하지 않음. 영향 없음.
- **relay, app 패키지**: manifest 타입을 사용하지 않음. 영향 없음.

---

## 식별된 문제와 기회

### Critical (구조적)

1. **타입 드리프트 위험**: guarded-wdk의 `Rule` 필드가 변경되면 manifest의 `ManifestRule`은 자동으로 따라가지 않는다. 현재는 우연히 동일하지만 향후 발산 가능.

2. **Decision 리터럴 하드코딩**: manifest `types.ts`의 3곳(line 98, 119, 140)에서 `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'`를 인라인으로 반복한다. guarded-wdk가 Decision variant를 추가하면 manifest는 누락된다.

### Major (이중 유지보수)

3. **ManifestArgCondition**: `condition` enum 값 8개(`EQ`, `NEQ`, `GT`, `GTE`, `LT`, `LTE`, `ONE_OF`, `NOT_ONE_OF`)가 guarded-wdk `ArgCondition`과 동일. 한쪽에서 variant 추가 시 다른 쪽 누락 가능.

4. **ManifestPermissionDict**: guarded-wdk `PermissionDict`와 `{[target]: {[selector]: Rule[]}}` 구조 동일. 현재 `manifestToPolicy()` 반환값을 guarded-wdk `CallPolicy.permissions`에 직접 대입 가능한 것은 우연의 일치에 의존.

### Minor (정리)

5. **PolicyPermission**: `@deprecated` 마크가 붙어 있고 코드에서 사용하는 곳 없음. 순수 dead code.

---

## 리팩토링 계획

### Step 1: guarded-wdk export 추가

**파일**: `packages/guarded-wdk/src/guarded-middleware.ts`

현재:
```ts
type Decision = 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
```

변경:
```ts
export type Decision = 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
```

**파일**: `packages/guarded-wdk/src/index.ts`

현재 export 목록:
```ts
export type { EvaluationResult, EvaluationContext, FailedArg, RuleFailure, Rule, PermissionDict, SignTransactionResult } from './guarded-middleware.js'
```

변경:
```ts
export type { EvaluationResult, EvaluationContext, FailedArg, RuleFailure, Rule, PermissionDict, SignTransactionResult, ArgCondition, Decision } from './guarded-middleware.js'
```

**검증**: guarded-wdk 기존 테스트 통과 확인. export 추가는 additive change이므로 기존 코드에 영향 없음.

**노력**: 낮음 (2줄 변경)
**위험**: 없음 (additive only)

---

### Step 2: manifest dependency 추가

**파일**: `packages/manifest/package.json`

현재:
```json
"dependencies": {
  "@wdk-app/canonical": "0.1.0"
}
```

변경:
```json
"dependencies": {
  "@wdk-app/canonical": "0.1.0",
  "@wdk-app/guarded-wdk": "0.0.1"
}
```

**검증**: `npm install` 또는 workspace link 확인. 순환 의존 없음 확인 (guarded-wdk는 manifest를 의존하지 않음).

**노력**: 낮음 (1줄 추가)
**위험**: 낮음. 순환 의존 발생 불가 (guarded-wdk -> canonical, manifest -> canonical + guarded-wdk, 단방향).

---

### Step 3: manifest types.ts 변경

**3a. 중복 타입 제거 + guarded-wdk import 추가**

**파일**: `packages/manifest/src/types.ts`

제거 대상 (line 107-151):
- `PolicyPermission` interface (line 111-120)
- `ManifestArgCondition` interface (line 125-129)
- `ManifestRule` interface (line 135-141)
- `ManifestPermissionDict` interface (line 147-151)

추가:
```ts
import type { ArgCondition, Rule, PermissionDict, Decision } from '@wdk-app/guarded-wdk'
export type { ArgCondition, Rule, PermissionDict, Decision }
```

**3b. UserConfig의 Decision 하드코딩 제거**

현재 (line 98):
```ts
decision?: 'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'
```

변경:
```ts
decision?: Decision
```

참고: `UserConfig.decision`은 optional이다. 이 Phase에서는 optional 제거를 하지 않는다(Out of Scope). `Decision` 타입 자체를 사용하되 `?`는 유지한다.

**검증**: TypeScript 타입 체크 통과 확인.

**노력**: 중간 (타입 삭제 + import + re-export + UserConfig 수정)
**위험**: 중간. manifest public API에서 `ManifestRule`, `ManifestArgCondition`, `ManifestPermissionDict`, `PolicyPermission` 이름이 사라지고 `Rule`, `ArgCondition`, `PermissionDict`, `Decision`으로 대체되므로 breaking change. 그러나 외부 소비자 없음 확인 완료.

---

### Step 4: manifest-to-policy.ts import 변경

**파일**: `packages/manifest/src/manifest-to-policy.ts`

현재 (line 1):
```ts
import type { Manifest, UserConfig, Feature, ManifestPermissionDict, ManifestRule } from './types.js'
```

변경:
```ts
import type { Manifest, UserConfig, Feature } from './types.js'
import type { PermissionDict, Rule } from '@wdk-app/guarded-wdk'
```

함수 시그니처 변경 (line 24):
```ts
): ManifestPermissionDict {
```
->
```ts
): PermissionDict {
```

내부 변수 타입 변경:
- line 40: `const dict: ManifestPermissionDict = {}` -> `const dict: PermissionDict = {}`
- line 52, 74: `const rule: ManifestRule = {` -> `const rule: Rule = {`

**검증**: 함수가 guarded-wdk `PermissionDict`을 반환하므로 `CallPolicy.permissions`에 직접 대입 가능. 타입 호환성 보장.

**노력**: 낮음 (import + 타입 주석 5곳 변경)
**위험**: 낮음. 로직 변경 없음, 타입 이름만 변경.

---

### Step 5: manifest index.ts export 변경

**파일**: `packages/manifest/src/index.ts`

현재:
```ts
export type {
  Manifest,
  ChainConfig,
  Feature,
  Call,
  Approval,
  Constraint,
  ValidationResult,
  UserConfig,
  PolicyPermission,
  ManifestRule,
  ManifestArgCondition,
  ManifestPermissionDict
} from './types.js'
```

변경:
```ts
export type {
  Manifest,
  ChainConfig,
  Feature,
  Call,
  Approval,
  Constraint,
  ValidationResult,
  UserConfig
} from './types.js'

// Policy types: re-exported from guarded-wdk via types.ts
export type { ArgCondition, Rule, PermissionDict, Decision } from './types.js'
```

**Re-export 결정**: manifest의 `types.ts`에서 guarded-wdk 타입을 import + re-export하고, `index.ts`는 `types.ts`로부터 re-export한다. 이렇게 하면:
- manifest 소비자는 `@wdk-app/manifest`에서 `Rule`, `PermissionDict` 등을 import 가능
- guarded-wdk를 직접 의존하지 않는 소비자도 사용 가능
- import 경로가 일관적 (모든 manifest 타입은 `@wdk-app/manifest`에서 import)

**노력**: 낮음 (export 목록 수정)
**위험**: 낮음. Breaking change이지만 외부 소비자 없음 확인 완료.

---

### Step 6: 테스트 파일 업데이트

**파일**: `packages/manifest/tests/manifest-to-policy.test.ts`

현재 (line 3):
```ts
import type { ManifestPermissionDict } from '../src/index.js'
```

변경:
```ts
import type { PermissionDict } from '../src/index.js'
```

파일 내 `ManifestPermissionDict` 전체 치환 -> `PermissionDict` (14곳).

**검증**: 전체 테스트 스위트 통과 확인. 기존 15개 테스트의 로직 변경 없음.

**노력**: 낮음 (이름 치환)
**위험**: 없음. 타입 어노테이션 변경만.

---

### Step 7: 최종 검증

1. `node --experimental-vm-modules node_modules/.bin/jest` (packages/guarded-wdk) -- 기존 테스트 통과
2. `node --experimental-vm-modules node_modules/.bin/jest` (packages/manifest) -- 기존 15개 테스트 통과
3. `npx tsc --noEmit` (packages/guarded-wdk) -- TypeScript 타입 체크 통과
4. `npx tsc --noEmit` (packages/manifest) -- TypeScript 타입 체크 통과
5. `grep -r "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/` -- 소스 코드에서 0건

---

## 의존성 그래프 (변경 후)

```
canonical
  ^         ^
  |         |
guarded-wdk |
  ^         |
  |         |
manifest ---+
```

guarded-wdk는 manifest를 알지 않는다. 단방향 의존 유지. ("No Two-Way Implements")

---

## 위험 평가와 완화 방안

| 위험 | 심각도 | 확률 | 완화 방안 |
|---|---|---|---|
| manifest public API breaking change | 중간 | 확정 | 외부 소비자 없음 확인 완료. Breaking change 적극 허용 원칙. |
| guarded-wdk Decision 타입 변경 시 manifest 빌드 실패 | 낮음 | 낮음 | 의도된 동작. 컴파일 타임에 불일치 감지. |
| 순환 의존 | 치명 | 없음 | guarded-wdk는 manifest를 import하지 않음. package.json 확인 완료. |
| 테스트 회귀 | 중간 | 낮음 | 로직 변경 없음. 타입 이름만 변경. 기존 15개 테스트로 검증. |
| 롤백 | - | - | 각 Step이 독립적. Step 1-2는 additive이므로 롤백 불필요. Step 3-6은 단일 커밋으로 원자적 롤백 가능. |

---

## 테스팅 전략

### 자동 테스트
- guarded-wdk 기존 테스트 스위트 (`packages/guarded-wdk/tests/`) -- export 추가가 기존 동작에 영향 없음 확인
- manifest 기존 테스트 스위트 (`packages/manifest/tests/manifest-to-policy.test.ts`) -- 15개 테스트 전수 통과 확인
- round-trip 테스트 (기존 test case "round-trip: output is structurally compatible with guarded-wdk CallPolicy") -- `PermissionDict`로 타입 변경 후에도 `CallPolicy.permissions`에 대입 가능 확인

### 수동 검증
- `grep -r "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/` 결과가 0건인지 확인
- `grep -r "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/manifest/` 결과가 0건인지 확인

---

## 성공 지표

1. `ManifestArgCondition`, `ManifestRule`, `ManifestPermissionDict`, `PolicyPermission` 타입이 `packages/` 소스 코드와 public export에서 제거됨 (Phase 문서 내 참조는 제외)
2. manifest `types.ts`에서 `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'` 하드코딩이 `Decision` 타입 참조로 대체됨
3. guarded-wdk `index.ts`에서 `ArgCondition`, `Decision`이 public export됨
4. `manifestToPolicy()` 반환 타입이 guarded-wdk `PermissionDict`
5. manifest `package.json`에 `@wdk-app/guarded-wdk` 의존 존재
6. guarded-wdk 테스트 전수 통과
7. manifest 테스트 전수 통과 (15개)
8. 순환 의존 없음

---

## 실행 순서 요약

```
Step 1  guarded-wdk: Decision export + index.ts export 추가
   |      (additive, 위험 없음)
   v
Step 2  manifest: package.json dependency 추가
   |      (additive, 위험 없음)
   v
Step 3  manifest: types.ts 중복 타입 삭제 + guarded-wdk import/re-export
   |      (breaking change, 외부 소비자 없음)
   v
Step 4  manifest: manifest-to-policy.ts import/타입 변경
   |      (타입 이름 변경)
   v
Step 5  manifest: index.ts export 변경
   |      (Step 3과 연동)
   v
Step 6  manifest: 테스트 파일 타입 이름 변경
   |      (타입 어노테이션만)
   v
Step 7  전체 테스트 실행 + 수동 검증
```

Step 1-2는 각각 독립 커밋 가능. Step 3-6은 하나의 원자적 커밋으로 묶는 것을 권장한다 (중간 상태에서 빌드가 깨지므로).

**권장 커밋 구조**:
- 커밋 1: `refactor(guarded-wdk): ArgCondition, Decision public export 추가` (Step 1)
- 커밋 2: `refactor(manifest): 정책 타입을 guarded-wdk에서 직접 참조 (v0.2.3)` (Step 2-6)
