# Aegis — AI Agent를 위한 정책 기반 실행 엔진

> Aegis는 Tether WDK 위에 구축된 정책 기반 AI 실행 레이어다.
> AI agent가 자율적으로 돈을 움직일 수 있게 하되, Owner가 정의한 범위 안에서만 — 서명 레이어 자체에서 강제한다.

**트랙**: Agent Wallets (WDK / Openclaw and Agents Integration)

---

## Aegis가 다른 프로젝트와 다른 점

대부분의 프로젝트는 묻는다: **"AI로 크립토에서 뭘 더 할 수 있을까?"**
Aegis는 다른 질문을 한다: **"어떻게 하면 AI가 크립토를 다루는 것을 신뢰할 수 있을까?"**

많은 프로토타입이 실행 속도를 우선시한다. Aegis는 **강제 가능한 통제**를 우선시한다. AI는 인간이 명시적으로 허락하기 전까지 아무것도 할 수 없으며, 그 허락은 WDK 서명 엔진 레벨에서 강제된다 — 프롬프트가 아니라, 애플리케이션 코드가 아니라, 확률적 임계값이 아니라.

해커톤이 제시한 Nice to Have 항목을 우리는 **프로젝트의 핵심으로 삼고 심도 있게 파고들었다**:

> **"Safety: permissions, limits, recovery, role separation"**
> — Agent Wallets 트랙, Nice to Have

다른 프로젝트에게 이것은 부가 기능이다. Aegis에게는 **프로젝트 전체가 이것이다.**

---

## Problem

사람들은 AI에게 돈을 맡기지 못한다 — **AI가 의도하지 않은 행동을 할 수 있기 때문이다.**

- AI가 판단을 잘못해서 전 재산을 모르는 주소로 보낸다. **되돌릴 수 없다.**
- AI가 스스로 판단해서 high-risk pool에 전액을 넣는다. **허락한 적 없다.**
- 그래서 매번 수동 승인을 요구한다. AI는 알림봇이 된다. **자동화의 의미가 없다.**

핵심 딜레마: **완전한 자율은 위험하고, 완전한 통제는 자동화를 죽인다.**

---

## Solution

Aegis는 **"AI가 내가 정한 범위 안에서만 움직이게 강제할 수 있는가?"**를 묻는다.

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
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {   // USDC contract
    "0xa9059cbb": [{                                  // transfer(address,uint256)
      "order": 0, "decision": "ALLOW",
      "args": {
        "0": { "condition": "ONE_OF", "value": ["0xAlice...", "0xBob...", "0xTreasury..."] },
        "1": { "condition": "LTE", "value": "1000000000" }   // ≤ 1,000 USDC
      }
    }]
  }
}
```

AI가 이 규칙을 벗어나는 트랜잭션을 시도하면 WDK가 서명을 거부한다. 프롬프트가 아니라 **서명 엔진 레벨의 강제**다.

| 영역 | 누가 통제 | 무슨 일이 일어나는가 |
|------|----------|-------------------|
| **정책 안** | Policy (owner가 사전 정의) | AI가 즉시 실행, 사람 개입 없음 |
| **정책 밖** | Owner (모바일, Ed25519 서명) | AI가 제안 → 사람이 서명 → 실행 |
| **정책 변경** | Owner만 가능 | AI가 요청할 수는 있지만 승인은 사람만 |

정책 자체를 AI가 만들거나 수정하거나 우회하는 것은 **불가능하다.**

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

Telegram Bot과 같은 구조다. 사용자가 Daemon 코드를 자기 서버에 받아서 실행하고, Relay는 메시지를 중계할 뿐이다:

```
  Telegram:  Bot (개인 서버) ──→ Telegram Server (중계) ──→ User (모바일)
  Aegis:     Daemon (개인 서버) ──→ Relay (중계) ──→ Owner (모바일 앱)
```

seed phrase와 AI agent는 사용자의 서버 안에서만 동작한다. Relay는 메시지를 복호화할 수 없으므로(E2E) 내용을 모른다. custodial 서비스와 근본적으로 다르다 — 제3자에게 자산을 맡기지 않는다.

---

## How It Works

### 정책 없음 → 승인 필요

```
  User: "Send 100 USDC to Alice"
    → AI tries transfer → Policy Engine: no policy → REJECT
    → ApprovalRequest → Relay (E2E) → Mobile App
    → Owner confirms → Ed25519 sign → Approve
    → 6-step verification → WDK sign → on-chain ✅
```

### 정책 있음 → 자율 실행

```
  User: "Send 100 USDC to Alice"
    → AI tries transfer → Policy Engine: all conditions met → ALLOW
    → WDK sign → on-chain ✅ (no human involved)
```

동일한 요청이 정책이 있으면 **사람 개입 없이 즉시 실행**된다. 정책의 존재 여부가 자율성의 스위치다. AI가 정책 범위를 벗어나면 — 물리적으로 서명되지 않는다.

---

## WDK Integration

Aegis는 WDK를 단순 호출하지 않는다. WDK 위에 **정책 레이어(GuardedWDK)**를 구축하여 모든 트랜잭션이 정책 평가를 거치도록 강제한다.

```
  WDK 원본:     wdk.signTransaction(tx) → 즉시 서명
  GuardedWDK:   guardedWdk.signTransaction(tx)
                  → evaluatePolicy(tx)   ← 정책 평가
                  → checkJournal(tx)     ← 중복 실행 방지
                  → ALLOW → sign  |  REJECT → ask Owner
```

AI(OpenClaw)는 GuardedWDK의 12개 도구만 사용 가능. seed 접근, 정책 수정, 서명 우회는 **불가능**하다.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Signing Engine** | GuardedWDK (@tetherto/wdk fork) |
| **Policy Catalog** | Manifest — JSON declarative protocol interface |
| **Orchestration** | Daemon — Node.js, OpenClaw |
| **Transport** | Relay — Fastify, Redis Streams, PostgreSQL |
| **Mobile App** | Expo (React Native), zustand, SecureStore |
| **Crypto** | Ed25519 (approval signing), ECDSA (on-chain tx signing) |

---

## Security

- **Seed Phrase**: WDK 내부에서만 관리. AI Agent는 접근 불가
- **Ed25519 Identity Key**: 디바이스의 SecureStore에 저장. 밖으로 나가지 않음
- **정책 강제**: 서명 엔진 레벨에서 강제 — AI가 우회, 수정, 삭제 불가능
- **승인 검증**: 6단계 (신뢰된 승인자 → 해지 확인 → 서명 유효 → 만료 확인 → nonce 확인 → 타입별 검증)
- **전송 보안**: E2E 암호화. Relay는 payload 복호화 불가. Daemon은 outbound WebSocket만 사용

---

## 트랙 적합성: Agent Wallets

### Must Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| OpenClaw for agent reasoning | Daemon에서 OpenClaw를 AI 엔진으로 사용 |
| WDK primitives (wallet, signing, accounts) | GuardedWDK가 WDK를 래핑하여 수행 |
| Hold, send, manage USD₮ autonomously | Policy 범위 내에서 자율 전송 |

### Nice to Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| agent logic ↔ wallet execution 분리 | **핵심 아키텍처.** OpenClaw → Daemon → GuardedWDK 완전 분리 |
| Safety: permissions, limits, role separation | **프로젝트의 존재 이유.** Policy Engine이 범위를 정의하고 위반 시 서명 거부 |

### Bonus ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| Composability with other protocols | Manifest(JSON)로 어떤 프로토콜이든 코드 변경 없이 연결 |
| Open-source LLM frameworks | OpenClaw — OpenAI-compatible API 기반 |

---

## 심사 기준

| Criterion | Aegis |
|-----------|-------|
| **Technical correctness** | 5개 패키지 모노레포, facade/port 패턴, CI 체크, 30+ 버전 반복 개발 |
| **Agent autonomy** | 정책 범위 내 완전 자율 — ALLOW 시 사람 개입 0 |
| **Economic soundness** | 금액 상한(LTE), 허용 주소(ONE_OF), 함수 단위 리스크 제어, 중복 실행 방지 |
| **Real-world applicability** | 모바일 앱 + 서버 + 서명 엔진 풀스택. E2E 암호화. 오프라인 복구 |

---

## 다른 프로젝트와의 비교

| | 일반적인 접근 | Aegis |
|---|---|---|
| **AI 통제** | 프롬프트 신뢰, confidence score | 서명 엔진 레벨에서 정책 강제 |
| **인간 승인** | 없음 | 정책 없으면 수동 승인, 정책 있으면 자율 |
| **규칙의 위치** | 애플리케이션 코드 | WDK 레이어 (AI 아래, 앱 아래) |
| **키 관리** | 다양함 | Seed는 WDK 내부, AI 접근 0 |

대부분의 프로토타입은 AI에게 월렛을 주고 가드레일을 추가한다. **Aegis는 권한 0에서 시작하여 사람이 원하는 만큼만 opt-in한다.**

---

## 실행 방법

```bash
docker compose up    # Daemon + Relay + Mobile App 전체 실행
cp .env.example .env # SEED_PHRASE, OPENCLAW_API_KEY, RELAY_URL 설정
```

seed phrase는 Daemon 서버의 `.env`에 저장되지만, AI agent는 이 파일에 접근할 수 없다 — GuardedWDK의 도구 API만 사용하며, 모든 서명 전에 정책 평가가 강제된다.

---

## 로드맵

**Phase 1 — WDK에 기여**: GuardedWDK를 WDK의 모듈로 기여한다. 현재 WDK는 stateless(요청대로 서명)인데, GuardedWDK가 stateful 정책 레이어를 추가한다. WDK를 사용하는 모든 프로젝트가 정책 제어를 바로 쓸 수 있게 된다.

**Phase 2 — 하드웨어 월렛 통합**: 서명 주체를 모듈화하여 Ledger/Trezor가 직접 서명하게 한다. seed가 어떤 서버에도 존재하지 않게 된다.

**Phase 3 — Manifest 생태계 확장**: WDK에 이미 존재하는 DeFi 프로토콜 모듈(`wdk-protocol-lending-aave-evm` 등)에 대한 Manifest를 작성하면 즉시 통합된다. 앞으로 나올 WDK CLI, 유틸리티, 커뮤니티 프로토콜도 Manifest 하나면 AI가 정책 제어 하에 사용 가능하다. WDK 생태계 전체가 정책 기반 AI 실행 레이어가 된다.
