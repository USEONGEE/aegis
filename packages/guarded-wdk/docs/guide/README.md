# Guarded WDK

AI 에이전트용 정책 기반 지갑 제어 레이어.
WDK 위에 얹어서 AI가 할 수 있는 것과 없는 것을 정책으로 제한한다.

## 설치

```js
import { createGuardedWDK, InMemoryApprovalBroker } from '@wdk-app/guarded-wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
```

## Quick Start

```js
const guardedWdk = createGuardedWDK({
  seed: 'abandon abandon abandon ...',

  wallets: {
    ethereum: {
      Manager: WalletManagerEvm,
      config: { provider: 'https://mainnet.infura.io/v3/...' }
    }
  },

  policies: {
    ethereum: {
      policies: [
        { type: 'timestamp', validAfter: 1700000000, validUntil: 1800000000 },
        {
          type: 'call',
          permissions: [
            {
              target: '0xAavePoolAddress',
              selector: '0x573ade81', // repay(address,uint256,uint256,address)
              args: { 1: { condition: 'LTE', value: '1000000000' } },
              decision: 'AUTO'
            },
            {
              target: '0xAavePoolAddress',
              selector: '0x573ade81',
              decision: 'REQUIRE_APPROVAL'
            }
          ]
        }
      ]
    }
  },

  approvalBroker: new InMemoryApprovalBroker()
})

const account = await guardedWdk.getAccount('ethereum', 0)
```

## 핵심 개념

### AI가 접근하는 것은 GuardedAccount뿐이다

```
AI Agent
  ↓ intent
GuardedAccount (policy + approval)
  ↓ 승인된 실행만
WDK Account (원본)
  ↓
Blockchain
```

AI에게는 `guardedWdk`만 넘긴다. 원본 WDK 인스턴스, seed, privateKey에는 접근할 수 없다.

### 차단되는 메서드

| 메서드 | 결과 |
|--------|------|
| `account.sign()` | `ForbiddenError` |
| `account.signTypedData()` | `ForbiddenError` |
| `account.keyPair` | `ForbiddenError` |
| `account.dispose()` | `ForbiddenError` |

### 정책 평가를 거치는 메서드

| 메서드 | 설명 |
|--------|------|
| `account.sendTransaction(tx)` | calldata 기반 정책 매칭 |
| `account.transfer(options)` | ERC-20 transfer calldata로 변환 후 정책 매칭 |

### 그대로 통과하는 메서드

| 메서드 | 설명 |
|--------|------|
| `account.getAddress()` | 주소 조회 |
| `account.getBalance()` | 잔액 조회 |

## 정책 (Policies)

### timestamp 정책

시간 범위 밖이면 모든 트랜잭션을 거부한다.

```js
{ type: 'timestamp', validAfter: 1700000000, validUntil: 1800000000 }
```

- `validAfter` — 이 시점 이전이면 거부 (선택)
- `validUntil` — 이 시점 이후면 거부 (선택)

### call 정책

트랜잭션의 target, selector, args를 매칭하여 결정한다.

```js
{
  type: 'call',
  permissions: [
    {
      target: '0x...',       // 컨트랙트 주소 (선택)
      selector: '0x573ade81', // 함수 selector (선택)
      args: { ... },          // 인자 조건 (선택)
      valueLimit: '1000',     // msg.value 상한 (선택)
      decision: 'AUTO'        // AUTO | REQUIRE_APPROVAL | REJECT
    }
  ]
}
```

permissions는 **위에서 아래로** 매칭된다. 첫 번째 매치의 decision을 사용한다.
아무것도 매치되지 않으면 **REJECT**.

### Decision

| Decision | 동작 |
|----------|------|
| `AUTO` | 즉시 실행 |
| `REQUIRE_APPROVAL` | ApprovalBroker를 통해 승인 대기 후 실행 |
| `REJECT` | `PolicyRejectionError` throw |

### 인자 조건 (args)

calldata의 ABI-encoded 인자를 인덱스로 지정하여 조건을 건다.

```js
args: {
  0: { condition: 'EQ', value: '0xTargetAddress' },
  1: { condition: 'LTE', value: '1000000000' }
}
```

| 연산자 | 설명 |
|--------|------|
| `EQ` | 같음 (대소문자 무시) |
| `NEQ` | 다름 |
| `GT` | 초과 |
| `GTE` | 이상 |
| `LT` | 미만 |
| `LTE` | 이하 |
| `ONE_OF` | 배열 중 하나 |
| `NOT_ONE_OF` | 배열에 없음 |

## ApprovalBroker

`REQUIRE_APPROVAL` decision이 나오면 ApprovalBroker가 외부 승인을 중개한다.

### InMemoryApprovalBroker

테스트/프로토타입용 인메모리 구현체.

```js
const broker = new InMemoryApprovalBroker()

// 승인 대기 중인 요청에 대해 외부에서 승인
broker.grant(ticketId, { approver: '0xOwnerAddress' })
```

흐름:
1. 정책 평가 → `REQUIRE_APPROVAL`
2. `broker.request(...)` → 티켓 생성
3. `broker.waitForApproval(ticketId, 60000)` → 승인 대기 (60초 타임아웃)
4. 외부에서 `broker.grant(ticketId, artifact)` 호출
5. 승인되면 `broker.consume(ticketId)` → 트랜잭션 실행

타임아웃 시 `ApprovalTimeoutError`.

## 이벤트

`guardedWdk.on(type, handler)`로 수명주기 이벤트를 수신한다.

| 이벤트 | 시점 | 주요 필드 |
|--------|------|-----------|
| `IntentProposed` | 트랜잭션 요청 진입 | `requestId`, `tx`, `chain` |
| `PolicyEvaluated` | 정책 평가 완료 | `requestId`, `decision`, `reason` |
| `ApprovalRequested` | 승인 대기 시작 | `requestId`, `target`, `selector` |
| `ApprovalGranted` | 승인 완료 | `requestId`, `approver` |
| `ExecutionBroadcasted` | 트랜잭션 전송 완료 | `requestId`, `hash`, `fee` |
| `ExecutionFailed` | 트랜잭션 실패 | `requestId`, `error` |
| `ExecutionSettled` | 온체인 확정 | `requestId`, `hash`, `status` |

```js
guardedWdk.on('ExecutionBroadcasted', (event) => {
  console.log(`tx ${event.hash} broadcasted`)
})

guardedWdk.on('PolicyEvaluated', (event) => {
  if (event.decision === 'REJECT') {
    console.log(`blocked: ${event.reason}`)
  }
})
```

## Facade API

`createGuardedWDK(config)`가 반환하는 객체.

| 메서드 | 설명 |
|--------|------|
| `getAccount(chain, index?)` | 정책이 적용된 account 반환 (frozen) |
| `getAccountByPath(chain, path)` | BIP-44 경로로 account 반환 |
| `getFeeRates(chain)` | 수수료 조회 |
| `updatePolicies(chain, newPolicies)` | 런타임 정책 교체 (deep copy) |
| `on(type, handler)` | 이벤트 구독 |
| `off(type, handler)` | 이벤트 해제 |
| `dispose()` | seed 등 민감 데이터 정리 |

`updatePolicies`는 deep copy를 수행한다. 외부에서 넘긴 객체를 나중에 변경해도 내부 정책에 영향 없음.

## 에러

| 클래스 | 발생 조건 |
|--------|-----------|
| `ForbiddenError` | 차단된 메서드 호출 (`sign`, `keyPair` 등) |
| `PolicyRejectionError` | 정책 평가 결과 REJECT |
| `ApprovalTimeoutError` | 승인 대기 타임아웃 (기본 60초) |

```js
import { ForbiddenError, PolicyRejectionError, ApprovalTimeoutError } from '@wdk-app/guarded-wdk'
```

## 예제: Aave repay 시나리오

```js
import { createGuardedWDK, InMemoryApprovalBroker } from '@wdk-app/guarded-wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const REPAY_SELECTOR = '0x573ade81'
const APPROVE_SELECTOR = '0x095ea7b3'

const broker = new InMemoryApprovalBroker()

const guardedWdk = createGuardedWDK({
  seed: process.env.MNEMONIC,
  wallets: {
    ethereum: {
      Manager: WalletManagerEvm,
      config: { provider: process.env.RPC_URL }
    }
  },
  policies: {
    ethereum: {
      policies: [
        {
          type: 'call',
          permissions: [
            // 1000 USDC 이하 repay → 자동 실행
            {
              target: AAVE_POOL,
              selector: REPAY_SELECTOR,
              args: { 1: { condition: 'LTE', value: '1000000000' } },
              decision: 'AUTO'
            },
            // 1000 USDC 초과 repay → 승인 필요
            {
              target: AAVE_POOL,
              selector: REPAY_SELECTOR,
              decision: 'REQUIRE_APPROVAL'
            },
            // USDC approve (Aave Pool에게, 5000 이하)
            {
              target: USDC,
              selector: APPROVE_SELECTOR,
              args: {
                0: { condition: 'EQ', value: AAVE_POOL },
                1: { condition: 'LTE', value: '5000000000' }
              },
              decision: 'AUTO'
            }
            // 그 외 모든 호출 → REJECT (매치 안됨)
          ]
        }
      ]
    }
  },
  approvalBroker: broker
})

// 이벤트 로깅
guardedWdk.on('PolicyEvaluated', (e) => {
  console.log(`[${e.decision}] ${e.reason}`)
})

const account = await guardedWdk.getAccount('ethereum', 0)

// AI 에이전트에게는 이 account만 넘긴다
// account.sign()       → ForbiddenError
// account.keyPair      → ForbiddenError
// account.sendTransaction(unknownTx) → PolicyRejectionError
```
