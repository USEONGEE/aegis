응, 그 방향이 더 맞다.

이제 너희가 만드는 건 **AI 앱**이 아니라
**WDK 위에 얹는 지갑 제어 레이어**다.

WDK는 애초에 self-custodial, stateless, multi-chain 지갑 프레임워크고, 계정·프로토콜·미들웨어를 조합하는 구조다. 계정은 잔고 조회와 트랜잭션 전송의 인터페이스이고, 코어에는 계정을 꾸미는 `registerMiddleware`도 있다. EVM 계정 예시 문서에는 `sendTransaction`, `transfer`, `sign`, `verify`가 있고, EVM typed data signing도 2026년 2월에 추가됐다. 또 WDK 코어는 계정에 lending/swaps/bridge 프로토콜을 등록하고 꺼내 쓰는 흐름을 공식적으로 제공한다. ([Wallet Development Kit][1])

그래서 결론은 이거다.

**맞는 설계는 “WDK를 단일 진실 지갑으로 두고, 그 앞에 Approval/Policy/Reporting wrapper를 둔다”** 이다.
AA permission 모델이 아니라, **WDK execution surface를 감싸는 deterministic guardrail** 로 가면 된다.

가장 중요한 포인트 하나만 먼저 박자.

**AI에게 raw WDK account를 주면 안 된다.**
WDK 계정에는 `sign(message)` 같은 저수준 서명 기능도 있고, `sendTransaction`도 있다. 그러니 AI가 raw account를 직접 만지는 구조는 사실상 끝이다. AI는 WDK를 직접 호출하는 게 아니라, **너희가 만든 GuardedAccount / GuardedProtocol API만 호출**해야 한다. ([Wallet Development Kit][2])

내가 보기엔 Phase 1의 정답은 아래다.

## 한 줄 정의

**Guarded WDK**
WDK account와 protocol 객체를 감싸서, 모든 실행을 정책 엔진으로 먼저 통과시키고, 조건에 걸리면 owner의 1회성 승인을 받은 뒤에만 underlying WDK 메서드를 호출하는 지갑 레이어.

---

## 핵심 설계 원칙

첫째, **wrap 대상은 `sign()` 하나가 아니라 execution surface 전체**다.

감싸야 하는 건 최소 이거다.

* `account.sendTransaction(...)`
* `account.transfer(...)`
* `account.getLendingProtocol('aave').supply / borrow / repay / withdraw`
* `account.getSwapProtocol(...).swap`
* `account.getBridgeProtocol(...).bridge`

WDK가 계정에 프로토콜을 등록하고 lending/swap/bridge 메서드를 꺼내 쓰게 해주기 때문에, 계정만 감싸고 프로토콜은 안 감싸면 구멍이 생긴다. ([Wallet Development Kit][3])

둘째, **approval은 UI가 아니라 artifact**여야 한다.

텔레그램은 알림 채널일 뿐이고, 진짜 승인 여부는
`ApprovalArtifact`가 유효한지로만 결정해야 한다.

셋째, **보고(report)는 AI가 쓰는 요약문이 아니라 이벤트 로그의 산출물**이어야 한다.

즉 “무슨 일이 일어났는지”는 AI가 해석해서 쓰는 게 아니라,
지갑 레이어가 알고리즘적으로 emit해야 한다.

---

## 제품 구조

이렇게 보면 된다.

```text
AI Agent
  ↓
Guarded WDK API
  ↓
Policy Engine
  ├─ AUTO
  ├─ REQUIRE_APPROVAL
  └─ REJECT
       ↓
Approval Broker
       ↓
Underlying WDK Account / Protocol
       ↓
Broadcast + Settlement Watcher
       ↓
Algorithmic Report Emitter
```

여기서 WDK는 진실 지갑이고,
너희가 만드는 건 그 위의 **control plane**이다.

---

## 이 설계가 좋은 이유

이 구조의 장점은 세 가지다.

하나는 **철학적으로 예쁘다.**
“새 지갑을 만든다”가 아니라
“WDK에 실사용 trust layer를 더한다”가 된다.

둘은 **실제 구현 범위가 좁다.**
기존 DeFi toolkit과 WDK를 그대로 쓰고,
중간에 policy / approval / reporting만 박으면 된다.

셋은 **해커톤 발표가 명확하다.**
“우리는 AI가 돈을 쓰게 만든 게 아니라, AI가 돈을 **통제된 방식으로만** 쓰게 만들었다.”

---

## PRD v1 — 나무만 남긴 버전

### 제품명

Guarded WDK

### 제품 목표

WDK를 단일 진실 지갑으로 사용하면서, AI의 모든 자금 관련 실행을 정책 기반으로 필터링하고, 필요한 경우 owner의 1회성 승인을 받아서만 실행하며, 실행 결과를 구조화된 이벤트로 자동 보고한다.

### 비목표

Phase 1에서 안 하는 것

* UI 완성
* 소셜/마켓플레이스
* 생활비 자동분배
* 복잡한 멀티체인 전략 일반화
* onchain permission 시스템
* AA 계정 전환

### 사용자

* AI 기반 DeFi agent를 돌리는 개인
* 소규모 treasury 운영자
* 자동화 봇에 자금을 맡기고 싶지만 통제가 필요한 유저

### 대표 유스케이스

Aave 포지션 감시 에이전트가 청산 위험을 발견한다.
작은 상환은 자동 실행한다.
큰 상환이나 새 프로토콜 액션은 owner 승인 요청 후 실행한다.
실행 결과는 자동 보고된다.

---

## 기능 요구사항

### FR-1 Guarded Account

WDK account 객체를 감싼 `GuardedAccount`를 제공해야 한다.

AI가 받는 건 raw WDK account가 아니라 이 객체다.

예:

```ts
interface GuardedAccount {
  sendTransaction(input: TxIntent): Promise<ExecutionResult | ApprovalPending>
  transfer(input: TransferIntent): Promise<ExecutionResult | ApprovalPending>
  getLendingProtocol(label: string): GuardedLendingProtocol
  getSwapProtocol(label: string): GuardedSwapProtocol
  getBridgeProtocol(label: string): GuardedBridgeProtocol
}
```

### FR-2 Policy Engine

모든 intent는 실행 전에 deterministic 정책 평가를 거쳐야 한다.

출력은 셋 중 하나다.

* `AUTO`
* `REQUIRE_APPROVAL`
* `REJECT`

### FR-3 Approval Broker

`REQUIRE_APPROVAL`인 경우 core는 승인 요청을 생성해야 한다.
단, core는 UI를 몰라야 한다.

즉 core는 이런 인터페이스만 알아야 한다.

```ts
interface ApprovalBroker {
  request(req: ApprovalRequest): Promise<ApprovalTicket>
  consume(ticketId: string): Promise<ApprovalArtifact | null>
}
```

Telegram, web, CLI, mobile은 전부 adapter다.

### FR-4 One-time Approval

승인은 1회성이어야 한다.

필수 필드:

* requestId
* walletId
* action hash
* expiry
* nonce
* approver
* signature

### FR-5 Underlying WDK Execution

정책과 승인이 통과하면 그때만 underlying WDK의 `sendTransaction`, `transfer`, 혹은 protocol method를 호출한다.

### FR-6 Algorithmic Reporting

모든 실행은 구조화된 이벤트로 보고되어야 한다.

최소 이벤트:

* `IntentProposed`
* `PolicyEvaluated`
* `ApprovalRequested`
* `ApprovalGranted`
* `ExecutionBroadcasted`
* `ExecutionSettled`
* `ExecutionFailed`

### FR-7 Settlement-based Reporting

보고는 AI의 자유서술이 아니라,
트랜잭션 결과와 사후 검증 상태를 기반으로 생성된다.

즉 최소한:

* tx hash
* chain
* target/protocol
* action type
* token / amount
* fee
* status
* timestamp
* requestId
* approval 여부

을 포함해야 한다.

### FR-8 Auditability

같은 입력 intent와 같은 policy라면 같은 decision이 나와야 하고,
같은 approval artifact는 같은 실행 하나에만 대응해야 한다.

---

## 보안 요구사항

### SR-1

AI는 raw WDK account 객체에 접근할 수 없어야 한다.

### SR-2

AI는 `sign()` 같은 generic signing primitive에 접근할 수 없어야 한다.

### SR-3

AI는 policy 수정, approval 승인, signer rotation에 접근할 수 없어야 한다.

### SR-4

승인은 replay 불가여야 한다.

### SR-5

Approval artifact 없이 out-of-policy execution은 절대 실행되면 안 된다.

### SR-6

지갑 시드와 민감정보는 plaintext 장기 저장 금지.
WDK Secret Manager는 mnemonic과 세션을 메모리 내에서 안전하게 다루고 plaintext 저장을 피하도록 설계돼 있으니, 지갑/승인 서비스 쪽 비밀 취급 substrate로 쓰기 좋다. ([Wallet Development Kit][4])

---

## 구현 방식

여기서 중요한 선택은 **fork냐 decorator냐**인데,
나는 **decorator + middleware**를 추천한다.

WDK 코어는 계정 파생 시 middleware 등록을 지원하니까,
너희는 `registerMiddleware('ethereum', approvalMiddleware)` 형태로
계정을 감싸는 decorator를 붙이는 식으로 갈 수 있다. WDK 문서도 middleware를 “account decoration and enhanced functionality” 용도로 설명한다. ([Wallet Development Kit][3])

즉 구현은 대략 이런 느낌이다.

```ts
const wdk = new WDK(seed)
  .registerWallet('ethereum', WalletManagerEvm, { provider })
  .registerProtocol('ethereum', 'aave', AaveProtocolEvm, aaveConfig)
  .registerMiddleware('ethereum', getApprovalCoreMiddleware(config))
```

그리고 `getApprovalCoreMiddleware`는 파생된 계정을 받아서
`sendTransaction`, `transfer`, `getLendingProtocol` 등을 감싼 계정 객체를 돌려준다.

이게 제일 예쁘다.

---

## 승인 설계

여기서 핵심은 **AI가 승인 여부를 묻는 것**과
**정말 owner가 승인했는지 증명하는 것**을 분리하는 거다.

### 1. Approval Request

core가 만든다.

```ts
type ApprovalRequest = {
  requestId: string
  walletAddress: string
  chain: string
  actionType: 'repay' | 'withdraw' | 'swap' | 'transfer'
  summary: string
  payloadHash: string
  expiresAt: number
}
```

### 2. Approval Artifact

owner 측에서 반환한다.

```ts
type ApprovalArtifact = {
  requestId: string
  payloadHash: string
  approvedAt: number
  expiresAt: number
  approver: string
  signature: string
}
```

여기서 core는 오직 `payloadHash` 기준으로만 검증한다.
“메시지 버튼 눌렀다”는 승인 증거가 아니다.

EVM 쪽은 typed data signing을 쓰는 게 제일 좋다. WDK의 EVM 지갑은 2026년 2월부터 `signTypedData` / `verifyTypedData`를 지원한다. 체인 공통 코어를 먼저 만들려면 generic message signing으로 시작하고, EVM에서는 typed data로 올리면 된다. ([Wallet Development Kit][5])

---

## 보고 설계

여기서 네가 말한 포인트가 아주 좋다.

**“AI가 휴리스틱하게 보고”하면 안 된다.**

맞다. 보고는 wallet layer의 일이다.

WDK의 실행 메서드들은 최소 `hash`와 `fee`를 반환한다. 예를 들어 EVM `sendTransaction`과 `transfer` 예시는 결과로 `hash`와 `fee`를 준다. 여러 체인 모듈은 `getTransactionReceipt(hash)`도 문서화되어 있다. 그래서 최소한 즉시 보고는 `hash/fee` 기반으로, 최종 보고는 receipt나 사후 상태 검증 기반으로 만들 수 있다. ([Wallet Development Kit][2])

그래서 보고는 두 단계가 좋다.

### Broadcast Report

전송 직후

```json
{
  "event": "ExecutionBroadcasted",
  "requestId": "req_123",
  "hash": "0xabc",
  "fee": "12000000000000",
  "action": "repay",
  "protocol": "aave",
  "amount": "300000000"
}
```

### Settlement Report

receipt / post-state 확인 후

```json
{
  "event": "ExecutionSettled",
  "requestId": "req_123",
  "hash": "0xabc",
  "status": "success",
  "confirmedAt": 1712345678,
  "stateDelta": {
    "healthFactorBefore": "1.03",
    "healthFactorAfter": "1.28"
  }
}
```

이렇게 하면 Telegram, Slack, DB, webhook 어디든 같은 구조체를 뿌릴 수 있다.

---

## 이 설계에서 제일 중요한 운영 원칙

이건 꼭 박아야 한다.

### AI는 “지갑 사용자”가 아니라 “지갑 요청자”다

AI는 돈을 쓰는 주체가 아니다.
AI는 지갑에 intent를 제출하는 클라이언트다.

### WDK는 프로세스 안 라이브러리가 아니라 wallet service 뒤에 있어야 한다

보안적으로는 이게 더 맞다.
AI 프로세스와 WDK 보유 프로세스를 분리해라.

* `agentd`: AI, 전략, intent 생성
* `walletd`: Guarded WDK, policy, execution
* `approvald`: owner approval 수집/검증
* `reportd`: 이벤트 송신

이렇게.

---

## 냉정한 판단

나는 이 방향이 **이전보다 훨씬 강하다**고 본다.

왜냐면 지금은 더 이상
“AI가 돈으로 이것저것 한다”가 아니라,

**“WDK를 실사용 가능한 agent wallet로 바꾸는 제어 레이어”**

가 되었기 때문이다.

이건 해커톤 데모로도 좋고,
나중에 진짜 SDK/오픈소스/미들웨어 제품으로도 좋다.

딱 하나만 조심하면 된다.

**절대로 AI에게 raw `sign()`이나 raw protocol object를 주지 마라.**
그 순간 Approval Core는 이름만 남는다.

다음엔 이걸 바로 코드 수준으로 내릴 수 있다.
원하면 내가 이어서 **TypeScript 인터페이스, 상태머신, middleware 골격**까지 바로 써주겠다.

[1]: https://docs.wdk.tether.io/sdk/get-started "Get Started | Wallet Development Kit by Tether"
[2]: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm/usage "Usage | Wallet Development Kit by Tether"
[3]: https://docs.wdk.tether.io/sdk/core-module/api-reference "API Reference | Wallet Development Kit by Tether"
[4]: https://docs.wdk.tether.io/tools/secret-manager "Secret Manager | Wallet Development Kit by Tether"
[5]: https://docs.wdk.tether.io/overview/changelog?utm_source=chatgpt.com "Changelog"
