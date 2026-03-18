# Guarded WDK - v0.0.1

## 문제 정의

### 현상
- WDK는 self-custodial, stateless, multi-chain 지갑 프레임워크이지만, AI 에이전트에게 WDK account를 그대로 넘기면 `sign()`, `sendTransaction()` 등 모든 저수준 메서드에 무제한 접근이 가능하다.
- `wdk-mcp-toolkit`이 AI-지갑 연동을 지원하지만, 정책 기반 제어 레이어가 없어 AI가 raw account를 직접 조작한다.
- 프로토콜(Aave 등)도 내부적으로 `account.sendTransaction()`을 직접 호출하므로, account만 노출되면 프로토콜 실행까지 무제한이다.

### 원인
- WDK의 설계가 "신뢰된 개발자가 직접 코드를 작성한다"는 전제이며, "비신뢰 클라이언트(AI)가 런타임에 실행을 요청한다"는 시나리오를 고려하지 않았다.
- WDK account는 서명(sign)과 브로드캐스트(broadcast)가 분리되지 않은 단일 메서드(`sendTransaction`)로 되어 있어, 중간에 정책 검증을 끼울 수 있는 seam이 없다.
- 프로토콜 레이어가 execution surface(account.sendTransaction)를 직접 호출하는 구조라, intent 생성과 실행이 분리되지 않았다.

### 영향
- **보안 위험**: AI가 raw `sign()`, `signTypedData()`에 접근하면 임의 메시지 서명이 가능하다.
- **통제 불가**: 금액 한도, 프로토콜 제한, 시간대 제한 등의 정책을 적용할 수 없다.
- **감사 불가**: AI가 어떤 트랜잭션을 왜 실행했는지 구조화된 기록이 없다.
- **사용자 승인 불가**: 큰 금액이나 위험한 액션에 대해 owner의 사전 승인을 받을 수 없다.

### 목표
- WDK account/protocol의 모든 execution surface를 감싸는 `GuardedAccount`를 제공하여, AI는 이 인터페이스만 사용한다.
- 모든 intent는 deterministic policy engine을 거쳐 `AUTO` / `REQUIRE_APPROVAL` / `REJECT` 중 하나로 분류된다.
- `REQUIRE_APPROVAL`인 경우 owner의 1회성, replay 불가, 서명된 승인을 받아서만 실행된다.
- 모든 실행은 구조화된 이벤트(`IntentProposed`, `PolicyEvaluated`, `ExecutionBroadcasted`, `ExecutionSettled` 등)로 자동 보고된다.
- 기존 WDK 모듈(core, wallet, protocol)은 수정하지 않고, decorator + middleware 패턴으로 위에 얹는다.

### 신뢰 경계

| 주체 | 접근 가능 | 접근 불가 |
|------|----------|----------|
| **Owner (사람)** | policy 설정, approval 승인 | raw WDK account 직접 접근 |
| **AI Agent (비신뢰)** | `GuardedAccount` API만 | raw account, `sign()`, `signTypedData()`, policy 수정, approval 승인 |
| **Guarded WDK 내부 runtime** | raw account 보유 (클로저/private) | 외부 export 금지 |

**보안 수준**: "AI runtime이 raw account를 절대 획득할 수 없어야 한다" (convention이 아닌 enforcement). factory 패턴으로 GuardedAccount만 export하고, raw account는 모듈 외부로 노출하지 않는다.

### approve() 처리 방침

AI는 `approve()`를 직접 호출할 수 있다. 단, approve 내부적으로 `sendTransaction()`을 호출하므로 contract level policy가 spender와 amount를 검증한다. 허용된 spender(예: Aave pool)와 제한된 amount 이내만 통과하며, 임의 spender에 대한 approve는 REJECT된다.

### 대표 사용자 및 Canonical Flow

**주 사용자**: AI 기반 DeFi agent를 돌리는 개인 (Aave 포지션 감시)

**Canonical Flow** (Aave 청산 위험 상환):
1. AI agent가 `guardedAccount.getLendingProtocol('aave').getAccountData()`로 health factor 감시 (read-only, 정책 불필요)
2. health factor < 1.1 감지
3. AI가 `guardedAccount.approve({ token: USDC, spender: aavePool, amount })` 호출 → policy가 spender+amount 검증 → 통과
4. AI가 `guardedAccount.getLendingProtocol('aave').repay({ token, amount })` 호출
5. Policy Engine이 calldata(target + selector + args) 평가:
   - amount ≤ threshold → `AUTO` → 즉시 실행
   - amount > threshold → `REQUIRE_APPROVAL` → owner에게 승인 요청
6. 승인 시 1회성 artifact 생성 → 실행
7. `ExecutionBroadcasted` → `ExecutionSettled` 이벤트 emit

### 비목표 (Out of Scope)
- UI/프론트엔드 (Telegram, web 등은 adapter로 나중에)
- AA (Account Abstraction) / ERC-4337 계정 전환
- 온체인 permission 시스템
- 복잡한 멀티체인 전략 일반화
- 소셜/마켓플레이스
- 생활비 자동분배
- 프로세스 분리 (`agentd`/`walletd`/`approvald`/`reportd`) — Phase 1에서는 단일 프로세스, 이후 분리

## 제약사항
- **기술적 제약**: 기존 WDK 모듈(npm 패키지)을 수정하지 않는다. 우리 포크(`USEONGEE/wdk`)에 새 코드만 추가한다.
- **구조적 제약**: 프로토콜이 `instanceof WalletAccountEvm` 체크를 하므로, account를 새 클래스로 교체하면 안 되고 middleware 방식으로 메서드를 감싸야 한다.
- **대표 유스케이스**: Phase 1에서는 EVM + Aave V3 시나리오(청산 위험 감지 → 소액 자동 상환 → 대액 승인 후 상환)에 집중한다.

## 참조
- 기존 PRD: `docs/PRD.md`
- WDK 공식 문서: https://docs.wallet.tether.io
- 포크 레포: https://github.com/USEONGEE/wdk
- 관련 레포: `wdk-wallet-evm`, `wdk-protocol-lending-aave-evm` (로컬 클론 완료)
