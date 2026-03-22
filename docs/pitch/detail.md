# Aegis — AI Agent를 위한 정책 기반 실행 엔진

> AI가 돈을 움직인다. 단, 내가 허락한 만큼만.

**트랙**: Agent Wallets (WDK / Openclaw and Agents Integration)

---

## Aegis가 다른 프로젝트와 다른 점

이 해커톤의 대부분의 프로젝트는 묻는다: **"AI로 크립토에서 뭘 더 할 수 있을까?"**

Aegis는 다른 질문을 한다: **"사람들이 AI가 크립토로 무언가를 하는 것을 어떻게 신뢰할 수 있을까?"**

다른 모든 프로젝트는 AI에게 월렛 접근 권한을 주고 잘 되기를 바란다 — confidence score, 휴리스틱 필터, 혹은 그냥 프롬프트를 믿는다. Aegis는 정반대 접근을 취한다: **AI는 인간이 명시적으로 허락하기 전까지 아무것도 할 수 없으며, 그 허락은 WDK 서명 엔진 레벨에서 강제된다 — 프롬프트가 아니라, 애플리케이션 코드가 아니라, 확률적 임계값이 아니라.**

해커톤이 제시한 Nice to Have 항목을 우리는 **프로젝트의 핵심으로 삼고 심도 있게 파고들었다**:

> **"Safety: permissions, limits, recovery, role separation"**
> — Agent Wallets 트랙, Nice to Have

다른 프로젝트에게 이것은 부가 기능이다. Aegis에게는 **프로젝트 전체가 이것이다.**

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
  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
    User's Private Server
  │                                                                       │
  │ ┌───────────────────────────────────────────────────────────────────┐ │
    │  DeFi Protocols                                                   │
  │ │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │ │
    │  │ Uniswap  │ │  Aave    │ │ Compound │ │   ...    │             │
  │ │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘             │ │
    │       └────────────┴─────┬──────┴────────────┘                    │
  │ │                          │                                        │ │
    │                    Manifest (JSON)                                 │
  │ │           "protocols declare their capabilities"                  │ │
    └──────────────────────────┼────────────────────────────────────────┘
  │                            │ auto-gen                                 │
                               ▼
  │ ┌──────────────────────────────────────────────────────────────────┐  │
    │                         Daemon                                    │
  │ │                                                                   │ │
    │   ┌─────────────┐    tool call    ┌──────────────────────────┐   │
  │ │   │  AI Agent   │ ──────────────→ │      GuardedWDK          │   │ │
    │   │ (OpenClaw)  │                 │   (Signing Engine)       │   │
  │ │   │             │ ← result/err ─ │                          │   │ │
    │   │ 12 tools    │                 │  ┌────────────────────┐  │   │
  │ │   │ only        │                 │  │   Policy Engine    │  │   │ │
    │   └─────────────┘                 │  │                    │  │   │
  │ │                                   │  │  tx → evaluate()   │  │   │ │
    │                                   │  │        │           │  │   │
  │ │                                   │  │   ┌────┴────┐      │  │   │ │
    │                                   │  │   │         │      │  │   │
  │ │                                   │  │ ALLOW    REJECT    │  │   │ │
    │                                   │  │   │         │      │  │   │
  │ │                                   │  │ sign    ask Owner  │  │   │ │
    │                                   │  │ (auto)  (approval) │  │   │
  │ │                                   │  └────────────────────┘  │   │ │
    │                                   └──────────────────────────┘   │
  │ │                                                                   │ │
    │   * seed, AI agent never leave this server                        │
  │ └──────────────────────────────┬────────────────────────────────────┘ │
  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                                   │
                            outbound WebSocket
                            E2E encrypted
                                   │
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                          Relay                                       │
  │                    (Blind Message Bus)                                │
  │                                                                      │
  │   - Cannot decrypt payload (E2E) — routing only                     │
  │   - Redis Streams persistence + offline recovery                    │
  │   - Like Telegram Bot long-polling:                                 │
  │     servers without domain/public IP can connect                    │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                          WebSocket + E2E encrypted
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                        Mobile App                                    │
  │                      (Owner Control)                                 │
  │                                                                      │
  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
  │   │   Chat   │ │ Approval │ │  Policy  │ │ Activity │              │
  │   └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
  │                                                                      │
  │   Ed25519 Identity Key (never leaves device)                        │
  └──────────────────────────────────────────────────────────────────────┘
```

핵심은 **4개 레이어의 역할 분리**다:

| 레이어 | 역할 | 신뢰 경계 |
|--------|------|----------|
| **DeFi Protocols** | Manifest로 자신의 기능을 선언 | 외부 — 코드 변경 없이 연결 |
| **Daemon** | AI + Policy Engine + 서명 엔진 | AI는 12개 도구만 사용, 정책 우회 불가 |
| **Relay** | E2E 암호화 메시지 중계 | payload 복호화 불가, 라우팅만 |
| **Mobile App** | Owner가 서명·감시·제어 | Ed25519 키는 디바이스 밖으로 나가지 않음 |

**Daemon과 DeFi Protocol은 사용자별 개인 서버에 위치한다.** seed phrase와 AI agent는 사용자의 인프라 안에서만 동작하며, 외부로 나가지 않는다. 이것은 custodial 서비스와의 근본적인 차이다 — 제3자에게 자산을 맡기지 않는다.

**Relay는 Telegram Bot의 long-polling 방식과 같은 역할이다.** 개인 서버에는 보통 고정 도메인이나 공인 IP가 없다. Relay가 중간에 존재함으로써, Daemon은 NAT 뒤에서 outbound WebSocket만으로 모바일 앱과 통신할 수 있다. 도메인 없는 개인 사용자도 별도 네트워크 설정 없이 바로 사용할 수 있다. Relay는 메시지를 복호화할 수 없으므로(E2E) 보안은 유지된다.

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

### Scenario 1: 정책 없음 — "승인이 필요하다"

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

### Scenario 2: 정책 있음 — "자율 실행"

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

### 키 관리
- **Ed25519 Identity Key**: Expo SecureStore에 저장. 디바이스 밖으로 절대 나가지 않음
- **Seed Phrase**: WDK 내부에서만 관리. AI Agent는 접근 불가
- **키 분리**: identity key(승인 서명용) ≠ signing key(온체인 tx용)

### 정책 강제
- 정책은 **서명 엔진 레벨**에서 강제됨 — 프롬프트가 아님
- AI가 정책을 우회, 수정, 삭제하는 것은 물리적으로 불가능
- 정책 변경은 Owner의 Ed25519 서명이 필요

### 승인 검증 (6단계)
1. 신뢰된 승인자인가?
2. 해지되지 않았나?
3. 서명이 유효한가?
4. 만료되지 않았나?
5. nonce 재사용이 아닌가?
6. 타입별 추가 검증

### 전송 보안
- Daemon ↔ App 통신은 **E2E 암호화** — Relay는 payload를 복호화할 수 없음
- Daemon은 NAT 뒤에서 **outbound WebSocket만** 사용 — 외부에서 접근 불가
- 오프라인 시 Redis Streams 커서 기반 복구 — 메시지 유실 없음

---

## 트랙: Agent Wallets (WDK / Openclaw and Agents Integration)

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

## 심사 기준

| Criterion | How Aegis Scores |
|-----------|-----------------|
| **Technical correctness** | 5개 패키지 모노레포 (guarded-wdk, manifest, daemon, relay, app). Facade/port 패턴. CI 체크. 타입 의존성 그래프 기반 아키텍처 검증 |
| **Degree of agent autonomy** | 정책 범위 내 완전 자율 실행 — ALLOW 판정 시 사람 개입 0. cron 기반 자율 스케줄링 지원 |
| **Economic soundness** | Policy가 금액 상한(LTE), 허용 주소(ONE_OF), 함수 셀렉터 단위로 리스크를 제어. 중복 실행 방지(Journal). AI가 정책 밖 행위를 시도하면 물리적으로 차단 |
| **Real-world applicability** | 풀스택 배포 가능: 모바일 앱(Expo) + 서버(Daemon+Relay) + 서명 엔진. E2E 암호화. 오프라인 복구. 실제 사용 가능한 인프라 |

---

## 다른 프로젝트와의 차이점

이 해커톤의 다른 프로젝트들은 **AI가 무엇을 할 수 있는지**에 집중한다 — lending, tipping, treasury 관리, DeFi 자동화. Aegis는 그 **아래 레이어**에 집중한다: **사람이 AI가 그 중 어떤 것이든 하는 것을 어떻게 신뢰할 수 있는가.**

| | 다른 프로젝트들 | Aegis |
|---|---|---|
| **AI 통제** | 프롬프트를 믿거나, confidence score, 혹은 통제 없음 | Policy Engine이 서명 엔진 레벨에서 규칙 강제 — AI가 물리적으로 우회 불가 |
| **인간 승인** | 없음. AI가 인간 게이트 없이 자율적으로 행동 | 모든 행위에 인간의 허락 필요. Policy = 사전 승인된 허락. Policy 없음 = 수동 승인 필요 |
| **규칙이 사는 곳** | 애플리케이션 코드 (변경, 우회, AI가 무시 가능) | WDK 레이어 — AI 아래, 애플리케이션 아래. Owner의 Ed25519 서명 없이 수정 불가 |
| **키 관리** | 많은 프로젝트가 private key를 직접 추출, 비밀 하드코딩, seed phrase를 로그에 출력 | Seed는 WDK를 절대 벗어나지 않음. AI는 접근 권한 0. Identity key는 디바이스를 벗어나지 않음 (SecureStore) |
| **아키텍처** | 단일 스크립트, 평면 파일 구조, 커밋 1개짜리 PoC | 5개 패키지 모노레포, 30개 이상 버전 반복, CI 체크, facade/port 패턴 |

근본적인 차이: 다른 프로젝트들은 AI에게 월렛을 주고 그 위에 가드레일을 추가한다. **Aegis는 권한 0에서 시작하여 사람이 원하는 만큼의 자율성만 정확히 opt-in하게 한다.** AI의 능력이 줄어드는 게 아니다 — 범위가 지정되는 것이다.

---

## 실행 방법

Aegis는 완전히 dockerize되어 있다. 전체 스택을 한 번에 시작할 수 있다:

```bash
docker compose up
```

이것이 실행하는 것:
- **Daemon** — AI agent + GuardedWDK 서명 엔진
- **Relay** — 메시지 버스 (Redis Streams + PostgreSQL)
- **Mobile App** — Expo dev server

### 환경 설정

```bash
cp .env.example .env
# .env를 편집하여 추가:
#   - SEED_PHRASE (월렛 시드)
#   - OPENCLAW_API_KEY (AI 엔진)
#   - RELAY_URL (relay 엔드포인트)
```

**중요**: seed phrase는 Daemon 서버의 `.env`에 저장된다. AI agent는 **이 파일에 접근할 수 없다** — GuardedWDK의 12개 도구 API를 통해서만 상호작용하며, 모든 서명 작업 전에 정책 평가를 강제한다. AI는 seed를 절대 보지 못하고, 키를 만지지 못하며, Policy Engine을 우회할 수 없다.

향후 버전에서는 서명 책임이 **하드웨어 월렛** (Ledger, Trezor)으로 위임되어, 서버에 seed phrase가 존재할 필요가 완전히 없어진다. 아래 로드맵 참조.

---

## 로드맵

### Phase 1 — WDK에 기여 (단기)
Aegis의 GuardedWDK 레이어(정책 평가, 승인 검증, 실행 저널)는 **WDK에 모듈로 기여하도록 설계**되었다. WDK는 현재 stateless하다 — 요청받는 대로 서명한다. Aegis는 모듈러 미들웨어로 통합할 수 있는 stateful 정책 레이어를 추가한다:

```
  WDK (stateless, 무조건 서명)
    + GuardedWDK 모듈 (stateful, 서명 전 정책 평가)
    = opt-in 정책 강제가 가능한 WDK
```

WDK를 사용하는 어떤 프로젝트든 처음부터 구축하지 않고도 정책 기반 제어를 추가할 수 있게 된다.

### Phase 2 — 하드웨어 월렛 통합
현재는 Daemon 서버가 seed phrase를 보유한다. 다음 단계는 **서명 주체를 모듈화**하는 것이다:

```
  현재:   Daemon → WDK (소프트웨어 서명, seed는 .env에)
  미래:   Daemon → WDK → Hardware Wallet (Ledger/Trezor가 직접 서명)
```

서명 인터페이스는 동일하게 유지된다 — GuardedWDK가 정책을 평가하되, 실제 서명은 하드웨어 디바이스에 위임한다. seed는 어떤 서버에도 존재하지 않게 된다.

### Phase 3 — 프로토콜 생태계
Manifest 시스템으로, 어떤 DeFi 프로토콜이든 JSON 선언서를 제공하여 통합할 수 있다. 프로토콜들이 Manifest 표준을 채택함에 따라:

```
  1 protocol  → 1 Manifest  → 자동 생성된 Policy → AI가 사용 가능
  10 protocols → 10 Manifests → 코드 변경 없이 AI의 역량이 확장
```

Aegis는 AI agent와 전체 DeFi 생태계 사이의 **신뢰 레이어**가 된다.
