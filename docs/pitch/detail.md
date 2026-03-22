# Aegis — AI DeFi Agent의 정책 기반 실행 엔진

> AI가 돈을 움직인다. 단, 내가 허락한 만큼만.

---

## Problem

사람들은 AI에게 돈을 맡기지 못한다. 이유는 하나다 — **AI가 내가 의도하지 않은 행동을 할 수 있기 때문이다.**

- AI에게 "100 USDC를 Alice에게 보내줘"라고 시킨다. 잘 된다. 그런데 다음 날 AI가 판단을 잘못해서 전 재산을 모르는 주소로 보낸다. **되돌릴 수 없다.**

- AI에게 Aave에 lending을 시킨다. AI가 supply까지는 좋았는데, 스스로 판단해서 high-risk pool에 전액을 넣는다. **허락한 적 없다.**

- 그래서 결국 매번 수동 승인을 요구한다. AI는 알림봇이 된다. **자동화의 의미가 없다.**

핵심 딜레마: **완전한 자율은 위험하고, 완전한 통제는 자동화를 죽인다.**

---

## Solution

Aegis는 "AI에게 돈을 맡겨도 되는가?"를 묻지 않는다. **"AI가 내가 정한 범위 안에서만 움직이게 강제할 수 있는가?"**를 묻는다.

답은 **Policy** — WDK 프로토콜 레벨에서 강제되는 선언적 규칙이다.

```
"AI는 USDC 컨트랙트의 transfer(address, uint256)를 호출할 수 있다.
 - 받는 주소는 [Alice, Bob, Treasury] 중 하나일 것
 - 금액은 1,000 USDC 이하일 것
 이 범위 내에서는 나한테 물어보지 마."
```

이것이 실제 Aegis에서는 이렇게 정의된다:

```jsonc
{
  // USDC 컨트랙트 주소
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {
    // transfer(address,uint256) 함수 셀렉터
    "0xa9059cbb": [
      {
        "order": 0,
        "decision": "ALLOW",
        "args": {
          // arg[0] 받는 주소: 이 목록에 있는 주소만 허용
          "0": { "condition": "ONE_OF", "value": ["0xAlice...", "0xBob...", "0xTreasury..."] },
          // arg[1] 금액: 1,000 USDC (6 decimals) 이하만 허용
          "1": { "condition": "LTE", "value": "1000000000" }
        }
      }
    ]
  }
}
```

컨트랙트 주소(`0xA0b8...`) → 함수 셀렉터(`0xa9059cbb` = transfer) → 인자 조건. AI가 이 규칙을 벗어나는 트랜잭션을 시도하면 WDK가 서명을 거부한다. 프롬프트가 아니라 **서명 엔진 레벨의 강제**다.

정책 안 → **AI가 즉시 자율 실행.** 사람 개입 없음.
정책 밖 → **AI가 요청하고, 사람이 서명해야 실행.**
정책 자체를 AI가 만들거나 수정하거나 우회하는 것은 **불가능하다.**

| 영역 | 누가 통제 | 무슨 일이 일어나는가 |
|------|----------|-------------------|
| **정책 안** | Policy (owner가 사전 정의) | AI가 즉시 실행, 사람 개입 없음 |
| **정책 밖** | Owner (모바일, Ed25519 서명) | AI가 제안 → 사람이 서명 → 실행 |
| **정책 변경** | Owner만 가능 | AI가 요청할 수는 있지만 승인은 사람만 |

이 구조가 기존 접근과 다른 점은 **제약이 코드나 프롬프트가 아니라 프로토콜 레벨**이라는 것이다. 프롬프트에 "1000 USDC 이상 보내지 마"라고 쓰는 건 AI가 무시할 수 있다. Aegis에서는 WDK 서명 엔진이 정책을 평가하고, 위반하면 **트랜잭션 자체가 서명되지 않는다.** AI가 아무리 원해도 물리적으로 실행이 불가능하다.

그리고 새로운 DeFi 프로토콜을 연결할 때 코드를 바꿀 필요가 없다. 프로토콜이 **Manifest**(JSON 선언서)를 제공하면, 그것이 자동으로 Policy로 변환되어 AI가 바로 사용할 수 있다. Aegis는 특정 프로토콜에 종속된 봇이 아니라, **어떤 프로토콜이든 붙을 수 있는 AI 실행 레이어**다.

---

## Architecture

```
  ┌───────────────────────────────────────────────────────────────────┐
  │  DeFi Protocols                                                   │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
  │  │ Uniswap  │ │  Aave    │ │ Compound │ │   ...    │             │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘             │
  │       └────────────┴─────┬──────┴────────────┘                    │
  │                          │                                        │
  │                    Manifest (JSON)                                 │
  │              "프로토콜이 자신의 기능을 선언"                          │
  └──────────────────────────┼────────────────────────────────────────┘
                             │ auto-gen
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                         Daemon                                    │
  │                                                                   │
  │   ┌─────────────┐    tool call    ┌──────────────────────────┐   │
  │   │  AI Agent   │ ──────────────→ │      GuardedWDK          │   │
  │   │ (OpenClaw)  │                 │    (서명 엔진)             │   │
  │   │             │ ← 결과/에러 ──  │                          │   │
  │   │ 12개 도구만  │                 │  ┌────────────────────┐  │   │
  │   │ 사용 가능    │                 │  │   Policy Engine    │  │   │
  │   └─────────────┘                 │  │                    │  │   │
  │                                   │  │  tx → evaluatePolicy()│   │
  │                                   │  │        │              │   │
  │                                   │  │   ┌────┴────┐         │   │
  │                                   │  │   │         │         │   │
  │                                   │  │ ALLOW    REJECT       │   │
  │                                   │  │   │         │         │   │
  │                                   │  │ 즉시 서명  승인 요청   │   │
  │                                   │  │ (자율)    (→ Owner)   │   │
  │                                   │  └────────────────────┘  │   │
  │                                   └──────────────────────────┘   │
  └──────────────────────────────┬────────────────────────────────────┘
                                 │
                          WebSocket + E2E 암호화
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                          Relay                                    │
  │                    (블라인드 메시지 버스)                            │
  │                                                                   │
  │   - 메시지 payload 복호화 불가 (E2E) — 라우팅만 담당                 │
  │   - Redis Streams 영속 + 오프라인 복구                              │
  └──────────────────────────────┬────────────────────────────────────┘
                                 │
                          WebSocket + E2E 암호화
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                        Mobile App                                 │
  │                      (Owner 제어판)                                │
  │                                                                   │
  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │   │   Chat   │ │ Approval │ │  Policy  │ │ Activity │           │
  │   │  AI와    │ │  승인     │ │  정책    │ │  실행    │            │
  │   │  대화    │ │  요청     │ │  관리    │ │  이력    │            │
  │   └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
  │                                                                   │
  │   Ed25519 Identity Key (디바이스 밖으로 나가지 않음)                 │
  └──────────────────────────────────────────────────────────────────┘
```

핵심은 **4개 레이어의 역할 분리**다:

| 레이어 | 역할 | 신뢰 경계 |
|--------|------|----------|
| **DeFi Protocols** | Manifest로 자신의 기능을 선언 | 외부 — 코드 변경 없이 연결 |
| **Daemon** | AI + Policy Engine + 서명 엔진 | AI는 12개 도구만 사용, 정책 우회 불가 |
| **Relay** | E2E 암호화 메시지 중계 | payload 복호화 불가, 라우팅만 |
| **Mobile App** | Owner가 서명·감시·제어 | Ed25519 키는 디바이스 밖으로 나가지 않음 |

AI가 트랜잭션을 요청하면 **Policy Engine이 평가**한다. 정책 범위 안이면 즉시 서명하고, 밖이면 Owner의 모바일로 승인 요청을 보낸다. 이 판정은 프롬프트가 아니라 **서명 엔진 레벨**에서 일어나기 때문에 AI가 우회할 수 없다.

새 프로토콜을 붙이는 방법:

```
  DeFi Protocol
    │
    │ Manifest (JSON 선언서)
    │  ┌──────────────────────────────────────┐
    │  │ protocol: "uniswap-v2"               │
    │  │ features:                            │
    │  │   - addLiquidity                     │
    │  │     calls: [router.addLiquidity()]   │
    │  │     approvals: [tokenA→router,       │
    │  │                  tokenB→router]      │
    │  │   - removeLiquidity                  │
    │  │     calls: [router.removeLiquidity()]│
    │  └──────────────────────────────────────┘
    │
    ▼
  manifestToPolicy() → Policy 자동 생성 → Owner 승인 → AI 사용 가능

  코드 변경: 0줄. AI 재학습: 불필요.
```

---

## How It Works

신뢰가 점진적으로 쌓이는 2개 시나리오로 Aegis의 핵심 메커니즘을 보여준다.

### Scenario 1: No Policy — "Approval Required"

```
  User: "Send 100 USDC to Alice"
    │
    ▼
  AI Agent ──→ tool_call: transfer(Alice, 100 USDC)
    │
    ▼
  Policy Engine: evaluatePolicy(tx)
    │
    └─ No matching policy found → REJECT
         │
         ▼
    ApprovalRequest 생성 → Relay (E2E) → Mobile App
         │
         ▼
    Owner가 내용 확인 → Ed25519 서명 → Approve
         │
         ▼
    Daemon: 6단계 검증 통과 → WDK 서명 → 온체인 전송 ✅
```

정책이 없으면 AI는 아무것도 자율로 실행할 수 없다. 모든 트랜잭션이 Owner의 모바일 승인을 거친다.

### Scenario 2: With Policy — "Autonomous Execution"

```
  User: "Send 100 USDC to Alice"
    │
    ▼
  AI Agent ──→ tool_call: transfer(Alice, 100 USDC)
    │
    ▼
  Policy Engine: evaluatePolicy(tx)
    │
    ├─ target: USDC contract     ✓
    ├─ selector: transfer        ✓
    ├─ arg[0] Alice: ONE_OF [Alice, Bob, Treasury]  ✓
    └─ arg[1] 100: LTE 1000 USDC  ✓
         │
         └─ ALLOW → WDK 즉시 서명 → 온체인 전송 ✅
              사람 개입 없음. 완전 자율.
```

동일한 요청이 정책이 있으면 **사람 개입 없이 즉시 실행**된다. 정책의 존재 여부가 자율성의 스위치다.

만약 AI가 정책 범위를 벗어나는 요청을 하면 — 예를 들어 5,000 USDC를 보내려 하면 — Policy Engine이 REJECT하고, 다시 Owner 승인 플로우로 돌아간다. **AI가 아무리 원해도 정책 밖의 트랜잭션은 물리적으로 서명되지 않는다.**

---

## WDK Integration

Aegis는 Tether WDK를 서명 엔진의 기반으로 사용한다. 단순히 WDK를 호출하는 것이 아니라, WDK 위에 **정책 레이어(GuardedWDK)**를 구축하여 모든 트랜잭션이 정책 평가를 거치도록 강제한다.

| WDK Primitive | Aegis에서의 사용 |
|---------------|-----------------|
| **Wallet Creation** | BIP-44 HD 월렛 자동 생성. seed는 AI가 접근 불가 |
| **Signing** | Policy Engine ALLOW 판정 후에만 서명 실행 |
| **Accounts** | 멀티 체인 계정 관리 (EVM 기반) |
| **Key Derivation** | Ed25519 identity key + ECDSA signing key 분리 |

```
  WDK 원본 호출:
    wdk.signTransaction(tx) → 즉시 서명

  GuardedWDK 호출:
    guardedWdk.signTransaction(tx)
      → evaluatePolicy(tx)      ← 정책 평가 추가
      → checkJournal(tx)        ← 중복 실행 방지 추가
      → ALLOW → wdk.signTransaction(tx)
      → REJECT → createApprovalRequest(tx)
```

AI(OpenClaw)는 GuardedWDK의 12개 도구만 사용할 수 있다:
- `sendTransaction`, `transfer`, `getBalance` — 온체인 실행
- `policyList`, `policyRequest` — 정책 조회 및 요청
- `registerCron` — 자율 스케줄링
- 그 외 조회/관리 도구

AI는 **seed 접근, 정책 수정, 서명 우회가 불가능**하다.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Signing Engine** | GuardedWDK (@tetherto/wdk fork) — JavaScript, ES Modules |
| **Policy Catalog** | Manifest — JSON declarative protocol interface |
| **Orchestration** | Daemon — Node.js, OpenClaw (OpenAI-compatible API) |
| **Transport** | Relay — Node.js, Fastify, Redis Streams, PostgreSQL |
| **Mobile App** | Expo (React Native), zustand, Expo SecureStore |
| **AI** | OpenClaw — OpenAI-compatible, tool-calling agent framework |
| **Crypto** | Ed25519 (identity/approval signing), ECDSA (on-chain tx signing) |
| **Communication** | WebSocket (outbound only), E2E encryption |

---

## Security

### Key Management
- **Ed25519 Identity Key**: Expo SecureStore에 저장. 디바이스 밖으로 절대 나가지 않음
- **Seed Phrase**: WDK 내부에서만 관리. AI Agent는 접근 불가
- **키 분리**: identity key(승인 서명용) ≠ signing key(온체인 tx용)

### Policy Enforcement
- 정책은 **서명 엔진 레벨**에서 강제됨 — 프롬프트가 아님
- AI가 정책을 우회, 수정, 삭제하는 것은 물리적으로 불가능
- 정책 변경은 Owner의 Ed25519 서명이 필요

### Approval Verification (6-Step)
1. 신뢰된 승인자인가?
2. 해지되지 않았나?
3. 서명이 유효한가?
4. 만료되지 않았나?
5. nonce 재사용이 아닌가?
6. 타입별 추가 검증

### Transport Security
- Daemon ↔ App 통신은 **E2E 암호화** — Relay는 payload를 복호화할 수 없음
- Daemon은 NAT 뒤에서 **outbound WebSocket만** 사용 — 외부에서 접근 불가
- 오프라인 시 Redis Streams 커서 기반 복구 — 메시지 유실 없음

---

## Track: Agent Wallets (WDK / Openclaw and Agents Integration)

### Must Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| OpenClaw for agent reasoning | Daemon에서 OpenClaw를 AI 엔진으로 사용. 12개 도구를 tool-calling으로 실행 |
| WDK primitives (wallet creation, signing, accounts) | GuardedWDK가 WDK를 래핑하여 모든 월렛/서명/계정 작업 수행 |
| Hold, send, manage USD₮ autonomously | Policy 범위 내에서 AI가 사람 개입 없이 USD₮ 자율 전송 |

### Nice to Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| Clear separation: agent logic ↔ wallet execution | **핵심 아키텍처.** OpenClaw(판단) → Daemon(중계) → GuardedWDK(서명) 완전 분리 |
| Safety: permissions, limits, recovery, role separation | **프로젝트의 존재 이유.** Policy Engine이 허용 범위를 선언적으로 정의하고, 위반 시 서명을 거부 |

### Bonus ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| Composability with other protocols | Manifest(JSON)를 제공하면 어떤 프로토콜이든 코드 변경 없이 연결 |
| Open-source LLM frameworks | OpenClaw — OpenAI-compatible API 기반 |

---

## Judging Criteria

| Criterion | How Aegis Scores |
|-----------|-----------------|
| **Technical correctness** | 5-package monorepo (guarded-wdk, manifest, daemon, relay, app). Facade/port pattern. CI checks. 타입 의존성 그래프 기반 아키텍처 검증 |
| **Degree of agent autonomy** | 정책 범위 내 완전 자율 실행 — ALLOW 판정 시 사람 개입 0. cron 기반 자율 스케줄링 지원 |
| **Economic soundness** | Policy가 금액 상한(LTE), 허용 주소(ONE_OF), 함수 셀렉터 단위로 리스크를 제어. 중복 실행 방지(Journal). AI가 정책 밖 행위를 시도하면 물리적으로 차단 |
| **Real-world applicability** | 풀스택 배포 가능: 모바일 앱(Expo) + 서버(Daemon+Relay) + 서명 엔진. E2E 암호화. 오프라인 복구. 실제 사용 가능한 인프라 |
