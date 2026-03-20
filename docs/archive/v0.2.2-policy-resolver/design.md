# 설계 - v0.2.2

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 컴포넌트(guarded-wdk, daemon) 수정, 내부 API(MiddlewareConfig) 변경, 타입 삭제(ChainPolicies, ChainPolicyConfig), 팩토리 config API 변경(policies 필드 제거).

---

## 문제 요약

middleware가 메모리 캐시(`policiesStore`)를 통해 정책을 읽는데, 멀티 지갑 도입 후 매 tool call마다 DB에서 다시 조회하여 캐시를 덮어쓰므로 캐시의 의미가 없음. middleware에 store를 직접 주입하면 캐시/swap/2개 타입이 모두 불필요.

> 상세: [README.md](README.md) 참조

## 접근법

**핵심 전략**: `MiddlewareConfig.policiesRef: () => ChainPolicies`를 `policyResolver: (chainId: number) => Promise<Policy[]>`로 교체. resolver는 factory의 closure에서 `currentAccountIndex`를 캡처하여 `store.loadPolicy(currentAccountIndex, chainId)`를 호출.

현재 흐름:
```
daemon: swapPoliciesForWallet() → wdk.updatePolicies() → policiesStore 덮어씀
middleware: policiesRef() → policiesStore 읽음
```

변경 후 흐름:
```
middleware: policyResolver(chainId) → store.loadPolicy(currentAccountIndex, chainId)
```

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: policyResolver 주입 (store 직접 조회) | 캐시/swap/타입 체인 모두 제거. 단일 소스(DB). | middleware가 async 호출 필요 (이미 async 함수 안에서 실행) | ✅ |
| B: 멀티 지갑 캐시 (accountIndex → chainId → config) | swap 제거, 캐시 유지 | 캐시 무효화 전략 필요, 메모리 관리 복잡 | ❌ |
| C: 현상 유지 (swap 패턴) | 변경 없음 | 근본 원인 미해결, silent bug 위험 | ❌ |

**선택 이유**: A. `evaluatePolicy`가 이미 async 함수 안에서 호출되므로 resolver가 Promise를 반환해도 문제없음. 캐시는 성능 이슈가 입증되기 전까지 불필요 (Primitive First 원칙).

## 기술 결정

| 결정 | 내용 | 근거 |
|------|------|------|
| resolver 시그니처 | `(chainId: number) => Promise<Policy[]>` | accountIndex는 closure 캡처, chainId만 파라미터 |
| accountIndex 전달 | factory closure `currentAccountIndex` 캡처 | 기존 메커니즘 재활용 (`getAccount` 시 갱신) |
| config.policies 제거 | `GuardedWDKConfig`에서 `policies` 필드 삭제 | store가 유일한 정책 소스 (사용자 확정) |
| approvalStore 필수 | `GuardedWDKConfig.approvalStore`를 optional → required로 승격. 없으면 throw (No Fallback) | store가 유일한 정책 소스이므로 store 없이 동작 불가 |
| ChainPolicies 삭제 | 타입 + export 제거 | 사용처 없어짐 |
| ChainPolicyConfig 삭제 | 타입 + export 제거 | 사용처 없어짐 |
| validatePolicies 유지 | resolver 반환값 검증에 사용 | 정책 검증은 여전히 필요 |

---

## 범위 / 비범위

- **범위**: guarded-middleware.ts, guarded-wdk-factory.ts, index.ts(export), daemon/tool-surface.ts, daemon/wdk-host.ts, daemon/control-handler.ts, 관련 테스트 + guide 문서
- **비범위**: Policy/CallPolicy/TimestampPolicy 타입, ApprovalStore 인터페이스, store 구현체(Json/Sqlite)

## 아키텍처 개요

변경 전:
```
factory → policiesStore (memory) → policiesRef() → middleware
daemon: swapPoliciesForWallet() → updatePolicies() → policiesStore 덮어씀
```

변경 후:
```
factory → policyResolver (closure) → middleware
              ↓
         store.loadPolicy(currentAccountIndex, chainId)
```

`policiesStore`, `swapPoliciesForWallet`, `ChainPolicies`, `ChainPolicyConfig` 모두 삭제.

## API/인터페이스 계약

| 변경 전 | 변경 후 |
|---------|---------|
| `MiddlewareConfig.policiesRef: () => ChainPolicies` | `MiddlewareConfig.policyResolver: (chainId: number) => Promise<Policy[]>` |
| `MiddlewareConfig.accountIndexRef: () => number` | 삭제 (resolver closure로 흡수) |
| `GuardedWDKConfig.policies?: Record<string, ...>` | 삭제 |
| `GuardedWDKFacade.updatePolicies(chainId, newPolicies, acctIndex)` | 삭제 (store.savePolicy 직접 사용) |
| `GuardedWDKConfig.approvalStore?: ApprovalStore` | `approvalStore: ApprovalStore` (required). 없으면 constructor throw. |
| `export type ChainPolicies` | 삭제 |
| `export type ChainPolicyConfig` | 삭제 |
| `export function validatePolicies` | 유지 |

## 데이터 모델/스키마

N/A: 저장 형식 변경 없음.

## 가정/제약

N/A: 외부 의존 없음.

## 테스팅 전략

1. **guarded-wdk 단위 테스트**: factory.test.ts — config.policies 관련 테스트 제거/수정, policyResolver mock 테스트 추가
2. **guarded-wdk 통합 테스트**: integration.test.ts — policiesRef → policyResolver 전환
3. **guarded-wdk 평가 테스트**: evaluate-policy.test.ts — evaluatePolicy 함수가 Policy[] 직접 받으므로 변경 최소
4. **daemon 테스트**: tool-surface.test.ts — swapPoliciesForWallet 관련 테스트 제거/수정
5. **daemon 테스트**: control-handler.test.ts — updatePolicies 호출 → store.savePolicy 직접 호출
6. **guide 문서**: packages/guarded-wdk/docs/guide/README.md 업데이트

---

## Step-by-step 구현 계획

### Step 1: MiddlewareConfig + middleware 내부 변경

**파일**: `packages/guarded-wdk/src/guarded-middleware.ts`

현재:
```typescript
interface MiddlewareConfig {
  policiesRef: () => ChainPolicies
  approvalBroker: SignedApprovalBroker
  emitter: EventEmitter
  chainId: number
  accountIndexRef: () => number
}
```

변경 후:
```typescript
interface MiddlewareConfig {
  policyResolver: (chainId: number) => Promise<Policy[]>
  approvalBroker: SignedApprovalBroker
  emitter: EventEmitter
  chainId: number
}
```

middleware 내부 3곳 변경:
```typescript
// 현재 (sendTransaction/transfer/signTransaction 각각)
const policies = policiesRef()
const { decision, ... } = evaluatePolicy(policies, chainId, tx)

// 변경 후
const policyArr = await policyResolver(chainId)
const { decision, ... } = evaluatePolicy(policyArr, chainId, tx)
```

`evaluatePolicy` 함수도 `ChainPolicies` 대신 `Policy[]`를 직접 받도록 변경:
```typescript
// 현재
function evaluatePolicy(chainPolicies: ChainPolicies, chainId: number, tx)
// 변경 후
function evaluatePolicy(policies: Policy[], chainId: number, tx)
```

`ChainPolicies`, `ChainPolicyConfig` 타입 삭제.

### Step 2: factory 변경

**파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`

1. `GuardedWDKConfig.policies` 필드 삭제
2. `policiesStore` 변수, 부팅 시 캐시 로직, `validatePolicies` 부팅 호출 삭제
3. `updatePolicies` 메서드 삭제 (facade에서 제거)
4. middleware 등록 시 `policyResolver` 주입:

```typescript
// approvalStore는 이제 required — factory 진입 시 검증 완료
wdk.registerMiddleware(chainKey, createGuardedMiddleware({
  policyResolver: async (chainId: number) => {
    const stored = await approvalStore.loadPolicy(currentAccountIndex, chainId)
    if (!stored) return []
    validatePolicies(stored.policies as Policy[])
    return stored.policies as Policy[]
  },
  approvalBroker,
  emitter,
  chainId: Number(chainKey)
}))
```

5. `GuardedWDKFacade` 인터페이스에서 `updatePolicies` 제거

### Step 3: daemon 소비자 변경

**파일**: `packages/daemon/src/tool-surface.ts`
- `swapPoliciesForWallet()` 함수 삭제
- tool call 전 swap 호출 제거 (sendTransaction, signTransaction, transfer)

**파일**: `packages/daemon/src/wdk-host.ts`
- 부팅 시 정책 복원 로직 삭제 (`restoredPolicies` 변수, for loop)
- `WDKInstance.updatePolicies` 메서드 삭제
- `createMockWDK`에서 `updatePolicies` 삭제

**파일**: `packages/daemon/src/control-handler.ts`
- `policy_approval` 핸들러: `wdk.updatePolicies` 호출 제거
- 대신 `handleControlMessage`의 기존 인자 중 `approvalStore`의 타입을 writer interface로 확장:
  ```typescript
  // 현재 (reader-only)
  interface ApprovalStoreReader {
    loadPendingByRequestId(...): Promise<...>
    getPolicyVersion(...): Promise<number>
  }
  // 변경 후
  interface ApprovalStoreWriter extends ApprovalStoreReader {
    savePolicy(accountIndex: number, chainId: number, input: PolicyInput): Promise<void>
  }
  ```
- `savePolicy` 호출 시: `store.savePolicy(payload.accountIndex, payload.chainId, { policies: payload.policies, signature: {} })`. 현재 control payload의 `signature` 필드는 `string`(Ed25519 서명 문자열)이며 `PolicyInput.signature: Record<string, unknown>`과 용도가 다름. 정책 내용의 서명 객체는 현재 control 흐름에서 전달되지 않으므로 빈 객체 `{}`로 저장. 이는 기존 `updatePolicies` 내부 동작(`(newPolicies).signature || {}`)과 동일.

### Step 4: export 정리 + guide 문서

**파일**: `packages/guarded-wdk/src/index.ts`
- `ChainPolicies`, `ChainPolicyConfig` export 제거

**파일**: `packages/guarded-wdk/docs/guide/README.md`
- config.policies 사용 예시 제거/수정

### Step 5: 테스트 수정

- factory.test.ts: config.policies 관련 테스트 수정, updatePolicies 테스트 수정 → store 직접
- integration.test.ts: policiesRef → policyResolver mock
- evaluate-policy.test.ts: evaluatePolicy 시그니처 변경에 맞춰 수정
- control-handler.test.ts: updatePolicies mock → store.savePolicy mock
- tool-surface.test.ts: swapPoliciesForWallet 관련 mock 제거

---

## 위험 평가

| 위험 | 심각도 | 완화 |
|------|--------|------|
| middleware 내부 async 전환 | Low | 이미 async 함수 내부에서 실행 |
| evaluatePolicy 시그니처 변경 | Medium | evaluate-policy.test.ts가 직접 커버 |
| updatePolicies 제거로 control-handler 영향 | Medium | store.savePolicy로 대체, 동일 검증 |
| config.policies 제거로 테스트 깨짐 | Medium | factory.test.ts에서 store 기반으로 전환 |

## 변경 대상 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `guarded-middleware.ts` | MiddlewareConfig 변경, evaluatePolicy 시그니처, ChainPolicies/ChainPolicyConfig 삭제 |
| `guarded-wdk-factory.ts` | policies config 삭제, policiesStore 삭제, updatePolicies 삭제, policyResolver 주입 |
| `index.ts` | ChainPolicies/ChainPolicyConfig export 삭제 |
| `daemon/tool-surface.ts` | swapPoliciesForWallet 삭제 |
| `daemon/wdk-host.ts` | 부팅 정책 복원 삭제, WDKInstance.updatePolicies 삭제 |
| `daemon/control-handler.ts` | wdk.updatePolicies → store.savePolicy |
| `docs/guide/README.md` | config.policies 예시 수정 |
| `tests/factory.test.ts` | config.policies/updatePolicies 테스트 수정 |
| `tests/integration.test.ts` | policiesRef → policyResolver |
| `tests/evaluate-policy.test.ts` | evaluatePolicy 시그니처 변경 |
| `tests/control-handler.test.ts` | updatePolicies mock 변경 |
| `tests/tool-surface.test.ts` | swapPoliciesForWallet 제거 |
