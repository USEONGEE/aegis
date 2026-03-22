# Aegis — Policy-Enforced Execution Engine for AI Agents

> Aegis is a policy-based AI execution layer built on Tether WDK.
> It lets AI agents move money autonomously — but only within the boundaries the Owner defines, enforced at the signing layer itself.

**Track**: Agent Wallets (WDK / Openclaw and Agents Integration)

---

## What Makes Aegis Different

Most projects ask: **"What more can AI do in crypto?"**
Aegis asks a different question: **"How can we trust AI to handle crypto?"**

Many prototypes prioritize execution speed. Aegis prioritizes **enforceable control**. The AI cannot do anything until a human explicitly grants permission, and that permission is enforced at the WDK signing engine level — not in prompts, not in application code, not through probabilistic thresholds.

The hackathon's Nice to Have item is what we made **the core of the entire project**:

> **"Safety: permissions, limits, recovery, role separation"**
> — Agent Wallets track, Nice to Have

For other projects, this is an add-on feature. For Aegis, **the entire project is this.**

---

## Problem

People cannot trust AI with their money — **because AI can act in unintended ways.**

- AI misjudges and sends an entire balance to an unknown address. **Irreversible.**
- AI decides on its own to deposit everything into a high-risk pool. **Never authorized.**
- So you require manual approval for every action. AI becomes a notification bot. **Automation is pointless.**

The core dilemma: **Full autonomy is dangerous, and full control kills automation.**

---

## Solution

Aegis asks: **"Can I force the AI to operate only within the boundaries I define?"**

The answer is **Policy** — declarative rules enforced at the WDK protocol level.

```
"The AI can call transfer(address, uint256) on the USDC contract.
 - Recipient must be one of [Alice, Bob, Treasury]
 - Amount must be ≤ 1,000 USDC
 Within this scope, don't ask me."
```

In Aegis, this is defined as:

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

If the AI attempts a transaction outside these rules, WDK refuses to sign. Not a prompt-level check — **enforcement at the signing engine level.**

| Scope | Who Controls | What Happens |
|-------|-------------|-------------|
| **Within policy** | Policy (pre-defined by Owner) | AI executes immediately, no human involvement |
| **Outside policy** | Owner (mobile, Ed25519 signature) | AI proposes → human signs → execution |
| **Policy changes** | Owner only | AI can request, but only humans can approve |

It is **impossible** for the AI to create, modify, or bypass policies.

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

Same topology as a Telegram Bot. The user runs the Daemon code on their own server; the Relay only routes messages:

```
  Telegram:  Bot (personal server) ──→ Telegram Server (relay) ──→ User (mobile)
  Aegis:     Daemon (personal server) ──→ Relay (relay) ──→ Owner (mobile app)
```

The seed phrase and AI agent operate exclusively on the user's server. The Relay cannot decrypt messages (E2E), so it has no knowledge of the content. This is fundamentally different from a custodial service — assets are never entrusted to a third party.

---

## How It Works

### No policy → Approval required

```
  User: "Send 100 USDC to Alice"
    → AI tries transfer → Policy Engine: no policy → REJECT
    → ApprovalRequest → Relay (E2E) → Mobile App
    → Owner confirms → Ed25519 sign → Approve
    → 6-step verification → WDK sign → on-chain ✅
```

### Policy exists → Autonomous execution

```
  User: "Send 100 USDC to Alice"
    → AI tries transfer → Policy Engine: all conditions met → ALLOW
    → WDK sign → on-chain ✅ (no human involved)
```

The same request executes **instantly without human intervention** when a policy exists. The presence of a policy is the switch for autonomy. If the AI exceeds the policy scope — the transaction is physically unsigned.

---

## WDK Integration

Aegis doesn't simply call WDK. It builds a **policy layer (GuardedWDK)** on top of WDK, forcing every transaction through policy evaluation.

```
  Original WDK:   wdk.signTransaction(tx) → signs immediately
  GuardedWDK:     guardedWdk.signTransaction(tx)
                    → evaluatePolicy(tx)   ← policy evaluation
                    → checkJournal(tx)     ← duplicate execution prevention
                    → ALLOW → sign  |  REJECT → ask Owner
```

The AI (OpenClaw) can only use GuardedWDK's 12 tools. Accessing the seed, modifying policies, and bypassing signatures are all **impossible**.

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

- **Seed Phrase**: Managed exclusively inside WDK. AI Agent cannot access it
- **Ed25519 Identity Key**: Stored in the device's SecureStore. Never leaves the device
- **Policy Enforcement**: Enforced at the signing engine level — AI cannot bypass, modify, or delete policies
- **Approval Verification**: 6 steps (trusted approver → revocation check → signature valid → expiry check → nonce check → type-specific validation)
- **Transport Security**: E2E encryption. Relay cannot decrypt payloads. Daemon uses outbound WebSocket only

---

## Track Alignment: Agent Wallets

### Must Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| OpenClaw for agent reasoning | Daemon uses OpenClaw as the AI engine |
| WDK primitives (wallet, signing, accounts) | GuardedWDK wraps WDK to perform all operations |
| Hold, send, manage USD₮ autonomously | Autonomous transfers within policy scope |

### Nice to Have ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| Agent logic ↔ wallet execution separation | **Core architecture.** OpenClaw → Daemon → GuardedWDK, fully decoupled |
| Safety: permissions, limits, role separation | **The reason this project exists.** Policy Engine defines boundaries and refuses to sign on violation |

### Bonus ✅

| Requirement | How Aegis Meets It |
|-------------|-------------------|
| Composability with other protocols | Manifest (JSON) connects any protocol without code changes |
| Open-source LLM frameworks | OpenClaw — OpenAI-compatible API |

---

## Judging Criteria

| Criterion | Aegis |
|-----------|-------|
| **Technical correctness** | 5-package monorepo, facade/port patterns, CI checks, 30+ version iterations |
| **Agent autonomy** | Fully autonomous within policy scope — zero human involvement on ALLOW |
| **Economic soundness** | Amount caps (LTE), allowed addresses (ONE_OF), function-level risk control, duplicate execution prevention |
| **Real-world applicability** | Mobile app + server + signing engine full-stack. E2E encryption. Offline recovery |

---

## Comparison with Other Projects

| | Typical Approach | Aegis |
|---|---|---|
| **AI Control** | Prompt trust, confidence scores | Policy enforcement at the signing engine level |
| **Human Approval** | None | Manual approval without policy, autonomous with policy |
| **Where Rules Live** | Application code | WDK layer (below AI, below app) |
| **Key Management** | Varies | Seed inside WDK, zero AI access |

Most prototypes give AI a wallet and add guardrails. **Aegis starts from zero permissions and lets humans opt-in to exactly the level of autonomy they want.**

---

## Design Trade-offs

Aegis prioritizes infrastructure over features (infrastructure-first, not feature-first).

In this demo, we intentionally limited scope to a single chain with minimal DeFi interactions. The goal is not to showcase many protocols, but to **prove that AI behavior can be safely constrained at the signing layer.**

Multi-chain abstraction and broader protocol support belong to the next phase. The current architecture (Manifest + Policy + GuardedWDK) is designed to extend chains and protocols without changes to the execution layer.

---

## How to Run

```bash
docker compose up    # Runs Daemon + Relay + Mobile App
cp .env.example .env # Configure SEED_PHRASE, OPENCLAW_API_KEY, RELAY_URL
```

The seed phrase is stored in the Daemon server's `.env`, but the AI agent cannot access this file — it uses only GuardedWDK's tool API, and policy evaluation is enforced before every signature.

---

## Roadmap

**Phase 1 — Contribute to WDK**: Contribute GuardedWDK as a WDK module. Currently WDK is stateless (signs whatever is requested); GuardedWDK adds a stateful policy layer. Every project using WDK would gain policy control out of the box.

**Phase 2 — Hardware Wallet Integration**: Modularize the signing subject so Ledger/Trezor can sign directly. The seed would exist on no server at all.

**Phase 3 — Manifest Ecosystem Expansion**: Write a Manifest for DeFi protocol modules already in WDK (`wdk-protocol-lending-aave-evm`, etc.) and they integrate immediately. Future WDK CLI tools, utilities, and community protocols need just one Manifest for AI to use them under policy control. The entire WDK ecosystem becomes a policy-based AI execution layer.
