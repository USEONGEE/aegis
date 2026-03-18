# 설계 - v0.0.1

## 변경 규모
**규모**: 일반 기능
**근거**: 5개 신규 모듈 생성, 새 public API(`createGuardedWDK`) 추가

---

## 문제 요약
AI 에이전트에게 WDK account를 그대로 넘기면 sign(), sendTransaction() 등 모든 저수준 메서드에 무제한 접근이 가능하여 보안/통제/감사가 불가능하다.

> 상세: [README.md](README.md) 참조

## 접근법

**Middleware + Factory 하이브리드**: WDK의 `registerMiddleware`로 account의 sendTransaction/transfer를 policy-guarded 버전으로 교체하고, `createGuardedWDK()` factory로 raw WDK 인스턴스를 클로저에 은닉한다.

**핵심 단순화**: Policy를 contract level(target + selector + args)에서만 평가한다. 프로토콜이 내부에서 `this._account.sendTransaction(tx)`를 호출하면 자동으로 policy를 타므로, protocol wrapping/bypass/AsyncLocalStorage가 전부 불필요하다.

핵심 아이디어:
1. Factory가 내부에서 WDK 인스턴스 생성 + guarded middleware 등록
2. Middleware가 sendTransaction/transfer를 policy-guarded 버전으로 교체, sign/signTypedData/keyPair/dispose는 차단
3. **approve()는 차단하지 않음** — approve도 내부적으로 `this.sendTransaction(tx)`를 호출하므로 policy가 spender/amount를 검증
4. **Protocol wrapping 없음** — protocol도 `this._account.sendTransaction(tx)`를 호출하므로 자동으로 policy 평가
5. Factory는 WDK 인스턴스를 외부에 노출하지 않고, 제한된 facade만 반환

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Middleware Only | instanceof 통과, 구현 단순 | raw account 은닉 불완전 | ❌ |
| B: Factory Only | raw account 완전 은닉 | instanceof 실패 | ❌ |
| C: Middleware + Factory | instanceof 통과 + raw account 은닉 | 약간의 추가 복잡도 | ✅ |
| ~~Protocol wrapping~~ | ~~프로토콜 레벨 policy~~ | ~~이중 guard, bypass 필요, 과도한 복잡도~~ | ❌ |

**선택 이유**: contract level policy만 쓰면 protocol wrapping이 불필요하고, AsyncLocalStorage/bypass/직렬화 큐가 전부 사라져서 설계가 극적으로 단순해진다.

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| Policy 레벨 | contract level only (target + selector + args) | 프로토콜 추상화 불필요, 모든 tx는 결국 sendTransaction으로 내려옴 |
| approve() | 차단 안 함 — policy가 spender + amount 검증 | approve는 내부적으로 sendTransaction을 호출하므로 자동으로 policy 통과 |
| Protocol wrapping | 없음 | protocol이 account.sendTransaction 호출 → 자동 guard |
| Bypass/AsyncLocalStorage | 없음 | 이중 guard가 발생하지 않으므로 불필요, 런타임 제약도 사라짐 |
| 이벤트 시스템 | Node.js 내장 `EventEmitter` 직접 사용 | Primitive First |
| 런타임 | Node.js + Bare 모두 지원 가능 | AsyncLocalStorage 제거로 런타임 제약 없음 |
| Prototype 우회 방어 | own property override + factory 은닉 + Object.freeze | 동일 프로세스 내 합리적 enforcement |
| Settlement | Phase 1 포함 (getTransactionReceipt 기반) | ExecutionSettled 이벤트까지 완전 구현 |

---

## 범위 / 비범위

**범위 (In Scope)**:
- EVM + Aave V3 시나리오
- GuardedWDK factory, guarded middleware
- Contract level policy (target + selector + args, ZeroDev CallPolicy 기반)
- Timestamp gate policy
- ApprovalBroker (인터페이스 + in-memory 구현)
- 7종 구조화 이벤트
- sendTransaction, transfer의 policy guard
- sign, signTypedData, keyPair, dispose 차단
- Settlement (getTransactionReceipt polling)
- 런타임 policy 교체 (`updatePolicies()`)

**비범위 (Out of Scope)**:
- 멀티체인 (BTC, Tron 등)
- Telegram/web/CLI approval adapter
- 프로세스 분리 (agentd/walletd)
- on-chain permission
- rateLimit policy (상태 관리 필요 — Phase 2)
- gas policy (누적 상태 필요 — Phase 2)

## 가정/제약

- 기존 WDK npm 패키지는 수정하지 않는다.
- account 객체에 Object.freeze를 적용하여 메서드 재할당/삭제를 방지한다. prototype chain 경유 호출까지 막지는 못하지만, 동일 프로세스 내에서 합리적 수준의 enforcement를 달성한다.
- Phase 1은 단일 블록체인(ethereum), 단일 프로토콜(aave)에 집중한다.
- ApprovalBroker adapter(Telegram 등)는 인터페이스만 정의하고 구현은 Phase 2.

---

## 아키텍처 개요

```
AI Agent
  │
  ▼
┌─────────────────────────────────────────┐
│ GuardedWDK Facade                       │
│ (createGuardedWDK가 반환)                │
│                                         │
│  getAccount(blockchain, index):         │
│    1. wdk.getAccount() 호출              │
│       → middleware: sendTx/transfer 교체 │
│       → middleware: sign/keyPair 차단     │
│       → _registerProtocols: getter 추가  │
│    2. Object.freeze(account)            │
│    3. return guarded account            │
│                                         │
│  updatePolicies(chain, policies)        │
│  on(eventType, handler)                 │
│  dispose()                              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Guarded Account (Object.freeze 적용)    │
│                                         │
│  sendTransaction → policy guard         │
│  transfer → policy guard                │
│  approve → NOT blocked (policy handles) │
│  sign → BLOCKED                         │
│  signTypedData → BLOCKED                │
│  keyPair → BLOCKED                      │
│  dispose → BLOCKED                      │
│                                         │
│  getLendingProtocol → 그대로 (wrapping X)│
│  getSwapProtocol → 그대로               │
│  (protocol 내부 sendTx도 자동 guard)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ evaluatePolicy()                        │
│  1. timestamp gate → 범위 밖이면 REJECT  │
│  2. call permissions 순서 매칭           │
│     target + selector + args 조건 비교   │
│     → AUTO / REQUIRE_APPROVAL / REJECT  │
└──────┬───────────┬──────────────────────┘
       │           │
   AUTO │      REQUIRE_APPROVAL
       │           │
       │           ▼
       │  ┌────────────────────────┐
       │  │ Approval Broker        │
       │  │  request() → ticket    │
       │  │  consume() → artifact  │
       │  └────────┬───────────────┘
       │           │ 승인 완료
       ▼           ▼
┌─────────────────────────────────────────┐
│ Raw WDK Account (클로저 내부)            │
│ rawSendTransaction, rawTransfer         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Event Emitter (Node.js 내장)             │
│ IntentProposed → PolicyEvaluated        │
│ → ApprovalRequested/Granted             │
│ → ExecutionBroadcasted                  │
│ → ExecutionSettled / ExecutionFailed     │
└─────────────────────────────────────────┘
```

### 왜 이중 guard가 발생하지 않는가

```
AI: account.getLendingProtocol('aave').repay({ token, amount })
  │
  ▼ AaveProtocolEvm.repay()
  │  내부: this._account.sendTransaction(repayTx)
  │         ↑ this._account = guarded account
  ▼
  guarded sendTransaction(repayTx)
  │  tx.to = aave pool address
  │  tx.data = 0x573ade81... (repay selector + args)
  │  → policy 평가: target + selector + args 매칭 → AUTO
  ▼
  rawSendTransaction(repayTx)
```

Protocol이 호출하든 AI가 직접 호출하든, **sendTransaction은 한 번만 호출**되고, 그 한 번에서 calldata 기반으로 policy를 평가한다. 이중 guard 자체가 없으므로 bypass가 필요 없다.

### approve() 흐름

```
AI: account.approve({ token: USDC, spender: aavePool, amount: 1000n })
  │
  ▼ WalletAccountEvm.approve()
  │  내부: this.sendTransaction(approveTx)
  │         ↑ this = guarded account
  ▼
  guarded sendTransaction(approveTx)
  │  tx.to = USDC address
  │  tx.data = 0x095ea7b3... (approve selector + [spender, amount])
  │  → policy 평가: target=USDC, selector=approve, args[0]=aavePool → AUTO
  ▼
  rawSendTransaction(approveTx)
```

approve는 차단하지 않고, policy가 spender를 known contract로 제한한다. 임의 spender에 대한 approve는 policy에 의해 REJECT.

### 모듈 구조 (Primitive First 적용)

```
src/guarded/
  index.js                    -- createGuardedWDK() re-export
  guarded-wdk-factory.js      -- factory + Node.js EventEmitter
  guarded-middleware.js        -- sendTx/transfer guard + 차단 + evaluatePolicy() inline
  approval-broker.js           -- InMemoryApprovalBroker
  errors.js                    -- ForbiddenError, PolicyRejectionError, ApprovalTimeoutError
```

**제거된 것 (Primitive First + contract level policy):**
- ~~`event-emitter.js`~~ → Node.js 내장 `EventEmitter`
- ~~`policy-engine.js`~~ → `evaluatePolicy()` 순수 함수 inline
- ~~`settlement-watcher.js`~~ → `pollReceipt()` inline helper
- ~~`intent.js`~~ → plain object inline
- ~~protocol wrapping~~ → 불필요 (contract level policy)
- ~~AsyncLocalStorage / bypass~~ → 불필요 (이중 guard 없음)
- ~~execution lock / 직렬화 큐~~ → 불필요 (bypass 없음)
- ~~auto-approve~~ → 불필요 (AI가 직접 approve, policy가 검증)

---

## 데이터 흐름

### Flow 1: AUTO 실행 (Aave repay, 소액)

```
AI: account.approve({ token: USDC, spender: aavePool, amount: 100n })
  → guarded sendTransaction → policy: approve to aavePool → AUTO → 실행

AI: account.getLendingProtocol('aave').repay({ token: USDC, amount: 100n })
  → protocol 내부 sendTransaction(repayTx) → policy 평가:
  1. timestamp gate → 유효 범위 내 → pass
  2. call permission 매칭:
     target=aavePool, selector=0x573ade81, args[1]=100n (LTE 1000n) → AUTO
  3. emit('IntentProposed')
  4. emit('PolicyEvaluated', { decision: 'AUTO' })
  5. rawSendTransaction(repayTx) → { hash, fee }
  6. emit('ExecutionBroadcasted', { hash, fee })
  7. pollReceipt(hash) → emit('ExecutionSettled')
  8. return { hash, fee }
```

### Flow 2: REQUIRE_APPROVAL 실행 (Aave repay, 대액)

```
AI: account.getLendingProtocol('aave').repay({ token: USDC, amount: 100000n })
  → protocol 내부 sendTransaction(repayTx) → policy 평가:
  1. timestamp gate → pass
  2. call permission 매칭:
     target=aavePool, selector=0x573ade81, args[1]=100000n
     첫 번째 rule (LTE 1000n) → 불일치
     두 번째 rule (repay, no amount condition) → REQUIRE_APPROVAL
  3. emit('IntentProposed')
  4. emit('PolicyEvaluated', { decision: 'REQUIRE_APPROVAL' })
  5. emit('ApprovalRequested')
  6. ApprovalBroker.waitForApproval(ticketId, timeout)
  7. owner 승인 → artifact 검증
  8. emit('ApprovalGranted')
  9. rawSendTransaction(repayTx) → { hash, fee }
  10. emit('ExecutionBroadcasted')
  11. pollReceipt(hash) → emit('ExecutionSettled')
  12. return { hash, fee }
```

### Flow 3: REJECT

```
AI: account.sendTransaction({ to: '0x알수없는주소', value: 1000n, data: '0x...' })
  → guarded sendTransaction → policy 평가:
  1. timestamp gate → pass
  2. call permission 매칭 → 매치 없음 → 기본 REJECT
  3. emit('IntentProposed')
  4. emit('PolicyEvaluated', { decision: 'REJECT' })
  5. throw PolicyRejectionError
```

---

## API/인터페이스 계약

### createGuardedWDK (진입점)

```javascript
/**
 * @param {Object} config
 * @param {string|Uint8Array} config.seed
 * @param {Object} config.wallets - { [blockchain]: { Manager, config } }
 * @param {Object} config.protocols - { [blockchain]: [{ label, Protocol, config }] }
 * @param {ChainPolicies} config.policies
 * @param {ApprovalBroker} config.approvalBroker
 * @returns {GuardedWDKFacade}
 */
function createGuardedWDK(config)
```

### GuardedWDKFacade

```javascript
{
  getAccount(blockchain, index = 0): Promise<GuardedAccount>
  getAccountByPath(blockchain, path): Promise<GuardedAccount>
  getFeeRates(blockchain): Promise<FeeRates>
  updatePolicies(chain: string, policies: Policy[]): void
  on(eventType, handler): void
  off(eventType, handler): void
  dispose(): void
}
```

### Policy 시스템 (ZeroDev permissions 모델 기반, contract level)

#### Policy 구조 (체인별)

```javascript
type ChainPolicies = {
  [chain: string]: {
    policies: Policy[]
  }
}
```

#### Policy 종류 (Phase 1)

| type | 역할 | ZeroDev 대응 |
|------|------|-------------|
| `call` | target + selector + args 기반 분기 | CallPolicy |
| `timestamp` | 시간 범위 제한 | TimestampPolicy |

#### Call Policy (선언적, contract level)

```javascript
{
  type: 'call',
  permissions: [
    {
      target: '0xAavePoolAddress',         // 컨트랙트 주소
      selector: '0x573ade81',              // repay(address,uint256,uint256,address)
      args: {
        1: { condition: 'LTE', value: '1000000000' }   // amount ≤ threshold
      },
      valueLimit: '0',                     // ETH 전송 제한 (wei)
      decision: 'AUTO'
    },
    {
      target: '0xAavePoolAddress',
      selector: '0x573ade81',              // repay — amount 조건 없음
      decision: 'REQUIRE_APPROVAL'
    },
    {
      target: '0xUSDCAddress',
      selector: '0x095ea7b3',              // approve(address,uint256)
      args: {
        0: { condition: 'EQ', value: '0xAavePoolAddress' },  // spender = aave pool만
        1: { condition: 'LTE', value: '1000000000' }         // amount 제한
      },
      decision: 'AUTO'
    }
  ]
}
```

#### 조건 연산자 (ZeroDev ParamCondition 기반)

| 연산자 | 의미 | 적용 대상 |
|--------|------|----------|
| `EQ` | 같음 | address, uint256, bytes32 |
| `NEQ` | 다름 | 위와 동일 |
| `GT`, `GTE` | 초과, 이상 | uint256 |
| `LT`, `LTE` | 미만, 이하 | uint256 |
| `ONE_OF` | 목록 중 하나 | address |
| `NOT_ONE_OF` | 목록에 없음 | address |

args의 키는 **calldata 인자 인덱스** (0-based). ZeroDev와 동일하게 `offset = index * 32`로 calldata에서 추출.

#### Timestamp Policy (gate)

```javascript
{ type: 'timestamp', validAfter: 1710000000, validUntil: 1720000000 }
```

#### 평가 순서

```
1. Gate policies (timestamp) → 실패 시 즉시 REJECT
2. Call policy permissions 순서대로 매칭:
   - tx.to === permission.target?
   - tx.data[0:4] === permission.selector?
   - calldata args 조건 충족?
   - valueLimit 이내?
   → 첫 번째 매치의 decision 반환
   → 매치 없음 → 기본 REJECT
```

#### evaluatePolicy (순수 함수, inline)

```javascript
function evaluatePolicy(chainPolicies, chain, tx) {
  const { policies } = chainPolicies[chain] || { policies: [] }

  // 1. gate policies
  for (const p of policies) {
    if (p.type === 'timestamp') {
      const now = Date.now() / 1000
      if (p.validAfter && now < p.validAfter) return { decision: 'REJECT', reason: 'too early' }
      if (p.validUntil && now > p.validUntil) return { decision: 'REJECT', reason: 'expired' }
    }
  }

  // 2. call permissions
  const callPolicy = policies.find(p => p.type === 'call')
  if (!callPolicy) return { decision: 'REJECT', reason: 'no call policy' }

  const txSelector = tx.data?.slice(0, 10)  // '0x' + 4bytes
  for (const perm of callPolicy.permissions) {
    if (perm.target && perm.target.toLowerCase() !== tx.to?.toLowerCase()) continue
    if (perm.selector && perm.selector !== txSelector) continue
    if (perm.args && !matchArgs(tx.data, perm.args)) continue
    if (perm.valueLimit && BigInt(tx.value || 0) > BigInt(perm.valueLimit)) continue
    return { decision: perm.decision, matchedPermission: perm }
  }

  return { decision: 'REJECT', reason: 'no matching permission' }
}
```

#### 런타임 업데이트

```javascript
guardedWdk.updatePolicies(chain, newPolicies)
```

**Immutable snapshot 교체**: deep copy 후 내부 reference 교체. in-flight 요청은 호출 시점에 캡처한 snapshot 사용.

### ApprovalBroker (인터페이스)

```javascript
class ApprovalBroker {
  async request(req: ApprovalRequest): Promise<ApprovalTicket>
  async waitForApproval(ticketId: string, timeoutMs: number): Promise<ApprovalArtifact | null>
  consume(ticketId: string): void
}

type ApprovalRequest = {
  requestId: string
  walletAddress: string
  chain: string
  target: string
  selector: string
  payloadHash: string
  expiresAt: number
}

type ApprovalArtifact = {
  requestId: string
  payloadHash: string
  approvedAt: number
  expiresAt: number
  approver: string
  signature: string
}
```

---

## 이벤트 스키마

| 이벤트 | 필드 |
|--------|------|
| `IntentProposed` | `{ type, requestId, tx, chain, timestamp }` |
| `PolicyEvaluated` | `{ type, requestId, decision, matchedPermission, reason, timestamp }` |
| `ApprovalRequested` | `{ type, requestId, target, selector, expiresAt, timestamp }` |
| `ApprovalGranted` | `{ type, requestId, approver, timestamp }` |
| `ExecutionBroadcasted` | `{ type, requestId, hash, fee, timestamp }` |
| `ExecutionSettled` | `{ type, requestId, hash, status, confirmedAt, timestamp }` |
| `ExecutionFailed` | `{ type, requestId, error, timestamp }` |

---

## 보안 모델

### 차단되는 API (AI 접근 불가)

| API | 차단 방법 | 이유 |
|-----|----------|------|
| `sign(message)` | ForbiddenError throw | 임의 메시지 서명 방지 (SR-2) |
| `signTypedData(data)` | ForbiddenError throw | 임의 typed data 서명 방지 (SR-2) |
| `keyPair` | getter 재정의 → ForbiddenError | private key 노출 방지 |
| `dispose()` | ForbiddenError throw | AI가 키를 삭제하는 것 방지 |

### Policy로 제어되는 API

| API | 동작 |
|-----|------|
| `sendTransaction(tx)` | calldata 기반 policy 평가 → AUTO / REQUIRE_APPROVAL / REJECT |
| `transfer(options)` | transfer를 tx로 변환 후 동일 policy 평가 |
| `approve(options)` | approve → 내부 sendTransaction → policy가 spender 검증 |

### 방어 계층

1. **API 분리**: AI에게는 `account` 객체만 전달. `guardedWdk` facade(updatePolicies, dispose 등)는 앱/관리자만 보유. SDK 사용자의 책임.
2. **Factory 은닉**: raw WDK 인스턴스, seed가 클로저에 갇힘
3. **메서드 교체**: own property로 guarded 메서드 설정 (prototype보다 우선)
4. **Object.freeze**: account 객체의 메서드 재할당/삭제 방지
5. **Contract level policy**: target + selector + args로 허용된 호출만 통과

### Enforcement 수준

- **Factory 클로저**: raw WDK 인스턴스와 seed가 외부에서 접근 불가
- **Object.freeze**: 메서드 재할당/삭제, 새 속성 추가를 방지. prototype chain 경유 `.call()` 우회는 위협 모델 밖
- 완전한 sandbox 필요 시 Phase 2에서 프로세스 분리

---

## 테스트 전략

### Unit Tests

| 대상 | 테스트 내용 |
|------|-----------|
| `evaluatePolicy()` | timestamp gate, selector 매칭, args 조건 비교, 순서 매칭, 기본 REJECT, 체인별 분리 |
| `matchArgs()` | EQ/NEQ/GT/GTE/LT/LTE/ONE_OF/NOT_ONE_OF 전체 연산자 |
| `InMemoryApprovalBroker` | 1회성 consume, expiry 체크, payloadHash 불일치 거부, replay 방지 |

### Integration Tests

| 시나리오 | 검증 내용 |
|---------|----------|
| Aave repay AUTO | policy 매칭 → 즉시 실행 → event emit 순서 |
| Aave repay REQUIRE_APPROVAL | policy → 승인 대기 → 승인 → 실행 |
| 미허용 sendTransaction | policy 매칭 없음 → PolicyRejectionError |
| approve to known spender | approve → sendTransaction → policy 통과 |
| approve to unknown spender | approve → sendTransaction → REJECT |
| sign() 차단 | ForbiddenError throw |
| settlement | 실행 후 pollReceipt → ExecutionSettled event |
| updatePolicies snapshot | 요청 A 평가 중 policy 교체 → A는 old snapshot, B는 new snapshot |

### Mock 전략
- WDK account: mock account (`getTransactionReceipt`, `getNetwork` 포함 provider mock)
- Blockchain: sendTransaction mock (hash, fee 반환)
- ApprovalBroker: InMemoryApprovalBroker

---

## 실패/에러 처리

| 상황 | 처리 |
|------|------|
| Policy REJECT | `PolicyRejectionError` throw + `PolicyEvaluated` event |
| Approval timeout | `ApprovalTimeoutError` throw + `ExecutionFailed` event |
| Approval artifact 검증 실패 | `InvalidApprovalError` throw |
| sendTransaction 실패 | 원본 에러 전파 + `ExecutionFailed` event |
| 차단된 메서드 호출 | `ForbiddenError` throw |

---

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| Prototype 우회 (Reflect + call) | 보안 | Object.freeze + factory 은닉, Phase 2: 프로세스 분리 |
| WDK 버전 업데이트 시 새 write 메서드 추가 | 보안 구멍 | 새 메서드는 기본 차단 (allowlist) |
| Object.freeze가 protocol 내부 동작에 영향 | 호환성 | protocol은 account 메서드 호출만 하므로 영향 없음 (검증 필요) |
| Selector 충돌 (다른 함수 동일 selector) | 보안 | target + selector 조합으로 충분히 구분 가능 |
| Settlement polling 부하 | 성능 | 1초 간격, 최대 60회 |
