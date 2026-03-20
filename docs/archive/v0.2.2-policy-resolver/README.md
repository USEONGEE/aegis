# Policy Resolver 도입 — v0.2.2

## 문제 정의

### 현상

1. **메모리 캐시가 무의미**: `ChainPolicies`(`policiesStore`)가 부팅 시 DB에서 로드되어 메모리에 캐싱되지만, 매 tool call마다 `swapPoliciesForWallet()`이 DB에서 다시 조회하여 캐시를 덮어씀. 캐시의 역할이 없음.

2. **middleware가 지갑을 모름**: middleware는 `policiesRef()`로 `ChainPolicies`(chainId만 키)를 읽음. 어떤 지갑의 정책인지 middleware 수준에서 알 수 없음. `accountIndexRef()`가 별도로 주입되지만 정책 조회와 분리되어 있음.

3. **swap 패턴의 위험성**: daemon이 tool call 전에 `swapPoliciesForWallet()`로 메모리 캐시를 교체. 단일 스레드라 현재는 문제없지만, swap 실패 시 이전 지갑의 정책으로 평가되는 silent bug 가능성 존재.

4. **불필요한 타입 체인**: `ChainPolicies` → `ChainPolicyConfig` → `Policy` 3단 체인이 타입 그래프 Layer 6~4를 차지. middleware에 store를 직접 주입하면 이 체인이 불필요.

### 원인

"1 daemon = 1 지갑" 시절에 부팅 시 한 번 로드하여 계속 쓰는 메모리 캐시 구조로 설계됨. v0.2.0에서 멀티 지갑을 도입하면서 구조를 바꾸지 않고 `swapPoliciesForWallet()`이라는 런타임 우회를 추가.

### 영향

1. 매 tool call마다 DB 조회 + 메모리 덮어쓰기가 발생하는 이중 작업
2. `ChainPolicies`/`ChainPolicyConfig` 타입이 guarded-wdk 타입 그래프의 최상위 2레이어를 차지하는 불필요한 복잡성
3. daemon의 `swapPoliciesForWallet()` 헬퍼가 guarded-wdk의 내부 상태를 외부에서 조작하는 경계 위반

### 목표

1. middleware가 `policyResolver: (chainId) => Promise<Policy[]>` 형태로 정책을 직접 조회. accountIndex는 factory의 `getAccount()` 호출 시 closure로 캡처되어 resolver 내부에서 사용.
2. `ChainPolicies` 타입, `ChainPolicyConfig` 타입, `policiesStore` 메모리 캐시 삭제
3. daemon의 `swapPoliciesForWallet()` 삭제
4. `MiddlewareConfig.policiesRef` → `policyResolver: (chainId) => Promise<Policy[]>` 교체. `accountIndexRef`도 제거 — accountIndex는 factory가 `getAccount(chain, index)` 호출 시 closure 변수 `currentAccountIndex`에 저장하고, resolver가 이를 캡처하여 `store.loadPolicy(currentAccountIndex, chainId)`를 호출.

### 비목표 (Out of Scope)

- 정책 캐싱 레이어 재도입 (현재 단계에서 불필요 — 성능 문제 발생 시 별도 검토)
- `Policy` / `CallPolicy` / `TimestampPolicy` 타입 자체 변경 (이들은 유지)
- `ApprovalStore.loadPolicy()` 시그니처 변경 (이미 `(accountIndex, chainId)` 형태)
- daemon의 tool-surface 로직 변경 (정책 조회 위치만 이동)

### Scope 경계 명확화

| 항목 | In/Out | 이유 |
|------|--------|------|
| `MiddlewareConfig.policiesRef` → `policyResolver` 교체 | IN | 핵심 변경 |
| middleware 내부 정책 조회 로직 변경 | IN | policiesRef() → policyResolver() 호출로 전환 |
| `ChainPolicies` 타입 삭제 | IN | 사용처 없어짐 |
| `ChainPolicyConfig` 타입 삭제 | IN | 사용처 없어짐 |
| `guarded-wdk-factory.ts` policiesStore 캐시 제거 | IN | 불필요한 캐시 |
| daemon `swapPoliciesForWallet()` 삭제 | IN | 불필요한 swap |
| daemon `wdk-host.ts` 부팅 시 정책 복원 로직 제거 | IN | 캐시 제거에 딸려옴 |
| `createGuardedWDK` config에서 `policies` 필드 제거 | IN | store가 유일한 정책 소스 |
| `MiddlewareConfig.accountIndexRef` 제거 | IN | resolver에 흡수 |
| `Policy` / `CallPolicy` / `TimestampPolicy` 변경 | OUT | 정책 규칙 타입은 유지 |
| `ApprovalStore` 인터페이스 변경 | OUT | 이미 적절한 시그니처 |

### 사용자 확정 결정사항

| 결정 | 내용 | 사유 |
|------|------|------|
| config.policies 경로 | 삭제 | store가 유일한 정책 소스. in-memory fallback 제거. 테스트도 store 기반으로 통일. |
| accountIndexRef | resolver closure로 흡수 | factory의 `currentAccountIndex`를 resolver closure가 캡처. middleware는 `policyResolver(chainId)`만 호출. accountIndexRef 별도 주입 불필요. |

## 제약사항

- Breaking change 허용 (프로젝트 원칙)
- 내부 저장 형식 변경 없음
- `createGuardedWDK` config에서 `policies` 필드 제거 (breaking)
