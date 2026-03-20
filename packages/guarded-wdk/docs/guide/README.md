# Guarded WDK

AI 에이전트용 정책 기반 지갑 제어 레이어.
WDK 위에 얹어서 AI가 할 수 있는 것과 없는 것을 정책으로 제한한다.

## 설치

```js
import { createGuardedWDK, SqliteApprovalStore } from '@wdk-app/guarded-wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
```

## Quick Start

```js
const guardedWdk = await createGuardedWDK({
  seed: 'abandon abandon abandon ...',

  wallets: {
    ethereum: {
      Manager: WalletManagerEvm,
      config: { provider: 'https://mainnet.infura.io/v3/...' }
    }
  },

  approvalStore: new SqliteApprovalStore('./wdk.db'),
  trustedApprovers: ['0xOwnerPublicKey']
})

const account = await guardedWdk.getAccount('ethereum', 0)
```

Policies are loaded from the `approvalStore` at runtime via `policyResolver`. Use `approvalStore.savePolicy()` to persist policies.

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
      decision: 'ALLOW'        // ALLOW | REJECT
    }
  ]
}
```

permissions는 **위에서 아래로** 매칭된다. 첫 번째 매치의 decision을 사용한다.
아무것도 매치되지 않으면 **REJECT**.

### Decision

| Decision | 동작 |
|----------|------|
| `ALLOW` | 즉시 실행 |
| `REJECT` | `PolicyRejectionError` throw + rejection_history 저장 |

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

ApprovalBroker는 policy/wallet 승인을 중개한다. tx 레벨 승인은 v0.2.5에서 제거되었다.

## 이벤트

`guardedWdk.on(type, handler)`로 수명주기 이벤트를 수신한다.

| 이벤트 | 시점 | 주요 필드 |
|--------|------|-----------|
| `IntentProposed` | 트랜잭션 요청 진입 | `requestId`, `tx`, `chain` |
| `PolicyEvaluated` | 정책 평가 완료 | `requestId`, `decision`, `reason` |
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
| `getApprovalBroker()` | SignedApprovalBroker 인스턴스 반환 |
| `getApprovalStore()` | ApprovalStore 인스턴스 반환 |
| `on(type, handler)` | 이벤트 구독 |
| `off(type, handler)` | 이벤트 해제 |
| `dispose()` | seed 등 민감 데이터 정리 |

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
import { createGuardedWDK, SqliteApprovalStore } from '@wdk-app/guarded-wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const store = new SqliteApprovalStore('./wdk.db')
await store.init()

// 정책을 store에 미리 저장
await store.savePolicy(0, 1, {
  policies: [
    {
      type: 'call',
      permissions: [
        { target: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', selector: '0x573ade81', args: { 1: { condition: 'LTE', value: '1000000000' } }, decision: 'ALLOW' },
        { target: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', selector: '0x573ade81', decision: 'REJECT' }
      ]
    }
  ],
  signature: {}
})

const guardedWdk = await createGuardedWDK({
  seed: process.env.MNEMONIC,
  wallets: {
    1: {
      Manager: WalletManagerEvm,
      config: { provider: process.env.RPC_URL }
    }
  },
  approvalStore: store,
  trustedApprovers: ['0xOwnerPublicKey']
})

// 이벤트 로깅
guardedWdk.on('PolicyEvaluated', (e) => {
  console.log(`[${e.decision}] ${e.reason}`)
})

const account = await guardedWdk.getAccount('1', 0)

// AI 에이전트에게는 이 account만 넘긴다
// account.sign()       → ForbiddenError
// account.keyPair      → ForbiddenError
// account.sendTransaction(unknownTx) → PolicyRejectionError
```
