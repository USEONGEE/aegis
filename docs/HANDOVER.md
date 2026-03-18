# 인수인계서 — Guarded WDK + WDK-APP

## 1. 프로젝트 전체 구조

```
AI가 DeFi를 안전하게 실행하는 시스템

┌─────────────────┐
│ Guarded WDK     │ ← 완료 (v0.0.1)
│ 지갑 제어 레이어  │
└────────┬────────┘
         │ 위에 얹는다
┌────────▼────────┐
│ WDK (Tether)    │ ← 기존 오픈소스 (수정 없이 사용)
│ 체인 추상화 지갑  │
└─────────────────┘

┌─────────────────┐
│ WDK-APP         │ ← 다음 개발
│ CLI + API + RN  │
└─────────────────┘
```

---

## 2. Guarded WDK (완료)

### 소스 위치
- 레포: `USEONGEE/wdk` (포크: `tetherto/wdk`)
- 코드: `/Users/mousebook/Documents/GitHub/wdk/src/guarded/`
- 테스트: `/Users/mousebook/Documents/GitHub/wdk/tests/guarded/`
- 설계 문서: `/Users/mousebook/Documents/GitHub/wdk/docs/phases/v0.0.1-guarded-wdk/`

### 파일 구조
```
src/guarded/
  index.js                    -- 진입점. createGuardedWDK, InMemoryApprovalBroker export
  guarded-wdk-factory.js      -- factory. WDK 인스턴스 생성+은닉, EventEmitter, updatePolicies
  guarded-middleware.js        -- 핵심. sendTx/transfer guard, evaluatePolicy, matchArgs, pollReceipt
  approval-broker.js           -- InMemoryApprovalBroker. 승인 상태 관리 (request/grant/wait/consume)
  errors.js                    -- ForbiddenError, PolicyRejectionError, ApprovalTimeoutError
```

### npm 패키지 접근
```javascript
import { createGuardedWDK, InMemoryApprovalBroker } from '@tetherto/wdk/guarded'
```
`package.json`의 `exports`에 `"./guarded"` subpath 추가됨.

### 핵심 개념

#### Policy 시스템 (ZeroDev permissions 모델 기반)
- **Contract level**: target(컨트랙트 주소) + selector(4byte 함수 시그니처) + args(인자 조건)
- **체인별 분리**: `policies.ethereum`, `policies.bitcoin` 등
- **선언적 JSON**: DB/파일/API에서 로드 가능, 코드 수정 불필요
- **런타임 교체**: `guardedWdk.updatePolicies(chain, newPolicies)` — immutable snapshot

#### 조건 연산자 8종
EQ, NEQ, GT, GTE, LT, LTE, ONE_OF, NOT_ONE_OF

#### Decision 3종
- `AUTO` — 즉시 실행
- `REQUIRE_APPROVAL` — owner 승인 후 실행
- `REJECT` — 차단 (PolicyRejectionError)

#### 이벤트 7종
IntentProposed → PolicyEvaluated → (ApprovalRequested → ApprovalGranted) → ExecutionBroadcasted → ExecutionSettled / ExecutionFailed

#### 차단되는 API
sign, signTypedData, keyPair, dispose → ForbiddenError

#### approve 처리
차단하지 않음. approve() 내부적으로 sendTransaction()을 호출하므로 policy가 spender+amount를 검증.

### 설계 원칙
- **Primitive First**: 가장 단순한 구현부터. 추상화는 반복이 증명된 후에.
- **No Fallback**: 실패하면 실패. 조용히 우회하거나 대체 경로 없음.
- **No Two-Way Implements**: 의존 방향 단방향.
- **No Backward Compatibility**: 바꿀 거면 한번에 바꾼다.

### 왜 이렇게 단순한가
처음에는 프로토콜 레벨 policy → protocol wrapping → AsyncLocalStorage bypass → reentrant lock까지 갔다가, **"sendTransaction 한 곳에서 calldata를 보고 판단하면 끝"**이라는 걸 깨닫고 전부 제거. ZeroDev의 CallPolicy가 정확히 이 방식.

### 테스트
```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/guarded/
# 43 passed, 0 failed
```

### 린트
```bash
npx standard src/guarded/
# clean
```

---

## 3. 관련 레포 (로컬 클론)

| 경로 | 레포 | 역할 |
|------|------|------|
| `/Users/mousebook/Documents/GitHub/wdk` | `USEONGEE/wdk` (포크) | 메인. Guarded WDK 포함 |
| `/Users/mousebook/Documents/GitHub/wdk-wallet-evm` | `tetherto/wdk-wallet-evm` | EVM 지갑 구현체 (참조) |
| `/Users/mousebook/Documents/GitHub/wdk-protocol-lending-aave-evm` | `tetherto/wdk-protocol-lending-aave-evm` | Aave 프로토콜 (참조) |
| `/Users/mousebook/Documents/GitHub/WDK-APP` | 새로 생성 | CLI + API + RN 앱 |

---

## 4. WDK 에코시스템 이해

### WDK는 뭔가
- Tether가 만든 self-custodial 멀티체인 지갑 프레임워크
- seed 하나로 EVM, BTC, Solana, TON 등 멀티체인 계정 파생
- 프로토콜 플러그인 (Aave, Uniswap 등)
- **seed를 저장하지 않음** — 메모리에만. 보관은 별도 (WDK Secret Manager)

### WDK 의존 구조
```
wdk (core, 오케스트레이터)
├── wdk-wallet (추상 인터페이스)
│   ├── wdk-wallet-evm
│   ├── wdk-wallet-btc
│   └── wdk-wallet-solana, ton, tron, spark
├── protocols/
│   ├── wdk-protocol-lending-aave-evm
│   ├── wdk-protocol-swap-velora-evm
│   └── wdk-protocol-bridge-usdt0-evm
└── wdk-mcp-toolkit (AI 연동용 MCP 서버)
```

### WDK 코드 핵심 포인트
- `wdk-manager.js`: `registerWallet`, `registerProtocol`, `registerMiddleware`, `getAccount`
- middleware 실행 순서: account 생성 → **middleware** → protocol 등록
- 프로토콜은 `this._account.sendTransaction(tx)`를 호출 → 우리 guard가 자동 적용
- 프로토콜이 `instanceof WalletAccountEvm` 체크 → 새 클래스로 교체 불가, middleware로 메서드만 교체

---

## 5. 사용법

### 기본 사용
```javascript
import { createGuardedWDK, InMemoryApprovalBroker } from '@tetherto/wdk/guarded'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm'

const broker = new InMemoryApprovalBroker()

const guardedWdk = createGuardedWDK({
  seed: 'your mnemonic...',
  wallets: {
    ethereum: { Manager: WalletManagerEvm, config: { provider: 'https://rpc...' } }
  },
  protocols: {
    ethereum: [{ label: 'aave', Protocol: AaveProtocolEvm }]
  },
  policies: {
    ethereum: {
      policies: [
        { type: 'timestamp', validAfter: 1710000000, validUntil: 1800000000 },
        {
          type: 'call',
          permissions: [
            // Aave repay 소액 자동
            {
              target: '0xAavePoolAddress',
              selector: '0x573ade81',
              args: { 1: { condition: 'LTE', value: '1000000000' } },
              decision: 'AUTO'
            },
            // Aave repay 대액 승인 필요
            {
              target: '0xAavePoolAddress',
              selector: '0x573ade81',
              decision: 'REQUIRE_APPROVAL'
            },
            // USDC approve to aave pool만
            {
              target: '0xUSDCAddress',
              selector: '0x095ea7b3',
              args: {
                0: { condition: 'EQ', value: '0xAavePoolAddress' },
                1: { condition: 'LTE', value: '1000000000' }
              },
              decision: 'AUTO'
            }
          ]
        }
      ]
    }
  },
  approvalBroker: broker
})

// 이벤트 구독
guardedWdk.on('PolicyEvaluated', (e) => {
  console.log(`${e.decision}: ${e.reason}`)
})

guardedWdk.on('ApprovalRequested', (e) => {
  console.log(`승인 필요: ${e.requestId}`)
  // 외부에서 승인: broker.grant(e.requestId, artifact)
})

// AI에게 account만 넘김
const account = await guardedWdk.getAccount('ethereum', 0)

// AI가 할 수 있는 것
await account.getBalance()
await account.getLendingProtocol('aave').getAccountData()
await account.approve({ token: USDC, spender: aavePool, amount: 1000n })
await account.getLendingProtocol('aave').repay({ token: USDC, amount: 500n })

// AI가 할 수 없는 것
account.sign('msg')          // → ForbiddenError
account.keyPair              // → ForbiddenError
account.sendTransaction({    // → PolicyRejectionError (미허용 target)
  to: '0x모르는주소', data: '0x...'
})

// 런타임 policy 교체
guardedWdk.updatePolicies('ethereum', newPolicies)
```

---

## 6. 다음 단계: WDK-APP

### 핵심 인사이트
모든 DeFi 기능은 "address + selector + args 조건"으로 분해된다.
타 프로토콜이 이걸 manifest로 제공하면 → policy 자동 생성 → 바로 사용.

### 5개 레이어
1. **Guarded WDK** — ✅ 완료
2. **Protocol Manifest 규격** — `getPolicyManifest()` 인터페이스. 프로토콜이 "policy에 뭐 넣어야 하는지"를 선언
3. **DeFi CLI** — manifest 기반 실행 + policy 관리
4. **OpenClaw 연동** — AI agent가 Guarded WDK account로 DeFi 실행
5. **RN App** — policy 관리 + approval + 시각화 + 서버 연결

### PRD
`/Users/mousebook/Documents/GitHub/WDK-APP/docs/PRD.md` 참조

### 기술 스택
- Protocol Manifest: JSON 규격 + JS 인터페이스
- CLI: Node.js + Commander.js
- API: Node.js + Fastify + WebSocket
- RN: Expo + zustand
- AI: OpenClaw (외부, 우리가 안 만듦)

---

## 7. 핵심 의사결정 이력

| 결정 | 이유 |
|------|------|
| WDK 포크, 기존 코드 수정 안 함 | 호환성 유지, npm 패키지 그대로 사용 |
| Contract level policy only | 프로토콜 레벨 policy → 이중 guard → bypass → 복잡도 폭발. calldata 한 곳에서 판단하면 끝 |
| approve() 차단 안 함 | approve 내부적으로 sendTransaction 호출 → policy가 자동 검증 |
| ZeroDev permissions 모델 차용 | 선언적 JSON, ABI 수준 세밀한 제어, 업계 검증된 구조 |
| AsyncLocalStorage 제거 | contract level policy로 이중 guard 자체가 없어져서 불필요 |
| Node.js + Bare 모두 지원 | AsyncLocalStorage 제거로 런타임 제약 해소 |
| Primitive First 5파일 | EventEmitter 내장, policy/intent/settlement inline |
| AI agent 안 만듦 | OpenClaw 등 외부 도구 사용. 우리는 지갑 레이어만 |

---

## 8. 주의사항

1. **seed는 WDK가 보관하지 않음**. 메모리에만 존재. 앱에서 WDK Secret Manager 또는 별도 보관 필요.
2. **AI에게 guardedWdk facade를 넘기면 안 됨**. account만 넘겨야 함. updatePolicies가 노출되면 AI가 자기 정책을 풀 수 있음.
3. **policy의 기본 decision은 REJECT**. 허용된 것만 통과 (allowlist).
4. **EVM only** (Phase 1). BTC/Solana 등은 tx 구조가 달라 evaluatePolicy 확장 필요.
5. **Object.freeze는 prototype chain 우회를 막지 못함**. 위협 모델 밖으로 정의. 완전한 격리는 프로세스 분리 필요.
