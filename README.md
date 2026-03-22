<p align="center">
  <img src="packages/app/assets/aegis-logo-v13-guarded.svg" width="160" alt="Aegis Logo" />
</p>

<h1 align="center">Aegis</h1>

<p align="center">
  <strong>Policy-Enforced Execution Engine for AI Agents on WDK</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/track-Agent%20Wallets-blue" alt="Track" />
  <img src="https://img.shields.io/badge/stack-WDK%20%2B%20OpenClaw-purple" alt="Stack" />
  <img src="https://img.shields.io/badge/versions-40%2B%20iterations-green" alt="Versions" />
  <img src="https://img.shields.io/badge/commits-159-orange" alt="Commits" />
</p>

> For the product rationale, trust model, and hackathon track alignment, see [`docs/pitch/detail.md`](docs/pitch/detail.md).
>
> This README covers how the codebase actually works — boot sequence, internal data flows, type contracts, persistence, and configuration.

---

## Hackathon Compliance

| Rule | Status |
|------|--------|
| WDK by Tether integration | GuardedWDK wraps `@tetherto/wdk` as the core signing engine |
| Public GitHub repository | This repo |
| Apache 2.0 license | [LICENSE](LICENSE) |

### Track: Agent Wallets

| Tier | Requirement | How Aegis Meets It |
|------|------------|-------------------|
| **Must** | OpenClaw for agent reasoning | Daemon uses OpenClaw as AI engine via `/v1/responses` |
| **Must** | WDK primitives (wallet, signing, accounts) | GuardedWDK wraps WDK — wallet creation, HD accounts, ECDSA signing |
| **Must** | Hold, send, manage USD₮ autonomously | Policy-gated autonomous transfers on HyperEVM |
| **Nice** | Agent logic ↔ wallet execution separation | Core architecture: OpenClaw → Daemon → GuardedWDK, fully decoupled |
| **Nice** | Safety: permissions, limits, role separation | **The entire project is this.** Policy Engine enforces boundaries at the signing layer |
| **Bonus** | Composability with other protocols | Manifest (JSON) — add any protocol without changing the execution layer |
| **Bonus** | Open-source LLM frameworks | OpenClaw — OpenAI-compatible gateway |

### Demo Video

https://www.youtube.com/watch?v=OWNVXC6Z4D0

### Run Out of the Box

All services (Relay, Daemon, OpenClaw, Redis, PostgreSQL) run via a single `docker compose up` on one machine. No public IP, domain, or SSL required — Daemon connects to Relay via outbound WebSocket.

```bash
cp .env.example .env   # Fill in MASTER_SEED and ANTHROPIC_API_KEY
docker compose up -d   # Starts all 5 services
```

Mobile App runs on a physical device via [Expo Go](https://expo.dev/go) on the same local network.

**Note**: In this demo, all services run on a single desktop. In production, the Relay would be hosted externally and each user runs their own Daemon on their private server — like Telegram Bot architecture.

### How to Run & Test

| Step | Command / Action |
|------|-----------------|
| 1 | `cp .env.example .env` — set `MASTER_SEED` (BIP-39 mnemonic) and `ANTHROPIC_API_KEY` |
| 2 | `docker compose up -d` — starts Relay, Daemon, OpenClaw, Redis, Postgres |
| 3 | `docker compose logs daemon` — copy the enrollment code (e.g. `TJ2Q-59LT`) |
| 4 | `cd packages/app && npm install && npx expo start` — open in Expo Go |
| 5 | Enter enrollment code in the app to pair device with daemon |
| 6 | Chat with AI: `"Send 0.01 USDT to 0x..."` — observe policy approval flow |

**Requirements**: Docker 27+, Node.js 20+, npm 10+, Expo Go on iOS/Android (same network)

### Third-Party Disclosure

| Service | Purpose | Type |
|---------|---------|------|
| **@tetherto/wdk** | HD wallet + signing engine | Core SDK |
| **OpenClaw** | AI agent gateway (session, tool execution, LLM routing) | Self-hosted (Docker) |
| **Enso Finance API** | Token price lookup | External API (free) |
| **HyperEVM RPC** | On-chain tx broadcast + balance query | Public RPC |
| **Redis 7** | Message stream persistence (Relay internal) | Self-hosted (Docker) |
| **PostgreSQL 16** | User-daemon binding storage | Self-hosted (Docker) |
| **Expo SDK 54** | Mobile app framework (React Native) | Open source |
| **Fastify** | Relay HTTP/WS server | Open source |
| **tweetnacl** | Ed25519 signing/verification | Open source |

---

## Table of Contents

- [Runtime Topology](#runtime-topology)
- [Monorepo Map](#monorepo-map)
- [Boot Sequence](#boot-sequence)
- [Core Execution Flows](#core-execution-flows)
- [GuardedWDK Internals](#guardedwdk-internals)
- [Approval System](#approval-system)
- [Tool Surface](#tool-surface)
- [Relay Protocol](#relay-protocol)
- [Event System](#event-system)
- [Persistence](#persistence)
- [Configuration Reference](#configuration-reference)
- [Development](#development)

---

## Runtime Topology

```
  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
    User's Private Server (docker compose)
  │                                                                     │
    ┌─────────┐    HTTP callback     ┌──────────┐     facade      ┌──────────┐
  │ │OpenClaw │ ──────────────────→  │  Daemon  │ ─────────────→  │Guarded-  │ │
    │ :18789  │   POST /api/tools/   │  :18790  │                 │  WDK     │
  │ │         │ ←── tool result ──── │          │ ←── result ──── │(@tether) │ │
    └─────────┘                      └────┬─────┘                 └──────────┘
  │                                       │ outbound WS                     │
  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                                          │ E2E encrypted
                                          ▼
                                   ┌─────────────┐
                                   │    Relay     │  Redis Streams + PostgreSQL
                                   │    :3000     │  cannot decrypt (E2E)
                                   └──────┬──────┘
                                          │ WS + E2E
                                          ▼
                                   ┌─────────────┐
                                   │  Mobile App  │  Ed25519 identity key
                                   │   (Expo)     │  never leaves device
                                   └─────────────┘
```

Trust boundary: seed phrase and AI agent never leave the user's server. Relay is a blind message bus.

---

## Monorepo Map

```
                    ┌───────────┐
                    │ canonical │  Layer 0
                    └─────┬─────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ protocol │ │guarded-  │ │ manifest │  Layer 1
        │          │ │  wdk     │ │          │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └──────┬─────┴────────────┘
                    ▼
              ┌──────────┐
              │  daemon  │  Layer 2
              └────┬─────┘
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
    ┌──────────┐ ┌──────┐ ┌─────────────────┐
    │   app    │ │relay │ │ openclaw-plugin  │  Layer 3
    └──────────┘ └──────┘ └─────────────────┘
```

| Package | Public Exports | What It Owns |
|---------|---------------|--------------|
| **canonical** | `intentHash`, `dedupKey`, `policyHash`, `canonicalJSON` | Deterministic hashing. All hash computation goes through here. Zero runtime deps |
| **guarded-wdk** | `createGuardedWDK`, `WdkStore`, `SqliteWdkStore`, `ExecutionJournal`, `verifyApproval`, 9 error classes, policy/approval types | Wraps `@tetherto/wdk`. Owns policy evaluation, approval verification, journal, and signing middleware |
| **manifest** | `erc20Transfer`, `erc20Approve`, `hyperlendDepositUsdt`, `Manifest`/`ToolCall` types, `manifestToPolicy`, `validateManifest` | Pure functions: params → `{ tx, policy, description }`. No side effects, no WDK dependency at runtime |
| **protocol** | `ControlMessage`, `ChatEvent`, `RelayEnvelope`, `QueryMessage`, `AnyWDKEvent`, `EventStreamPayload` | Wire format types only. Zero runtime code |
| **daemon** | Not a library (entry point: `index.ts`) | Orchestration: OpenClaw client, tool dispatch, relay connection, cron scheduler, message queue |
| **relay** | Not a library (Fastify server) | JWT auth, Redis Streams pub/sub, PostgreSQL registry, WebSocket routing |
| **app** | Not a library (Expo app) | `SignedApprovalBuilder`, `RelayClient`, zustand stores, React screens |
| **openclaw-plugin** | OpenClaw extension entry point | Maps OpenClaw tool definitions → HTTP callbacks to Daemon's Tool API |

Dependencies are strictly unidirectional. CI check `boundary-layer` enforces this at every commit.

---

## Boot Sequence

`packages/daemon/src/index.ts` — numbered steps match the source comments:

```
  1. loadConfig()
     ↓  env vars → DaemonConfig struct
  2. initWDK(config)
     ↓  SqliteWdkStore.init() → load/provision master seed
     ↓  → load trusted approvers (active signers)
     ↓  → createGuardedWDK({ seed, wallets, protocols, store, approvers })
     ↓    → WDK(seed), register EVM wallet (chain 999), apply guarded middleware
     ↓    → auto-create accountIndex=0 wallet if store empty
     ↓  Returns { facade, store }
  2b. SqliteDaemonStore.init()
     ↓  daemon-specific persistence (crons)
  3. createOpenClawClient(config)
     ↓  raw fetch wrapper for /v1/responses
  5. RelayClient + authenticateWithRelay()
     ↓  POST /api/auth/daemon/login → JWT
     ↓  POST /api/auth/daemon/enroll → enrollment code (displayed in terminal)
     ↓  relay.connect(ws://relay:3000/ws/daemon, jwt)
     ↓  retry loop: 10 attempts × 3s delay (Docker startup order)
  6. Build ToolExecutionContext { facade, daemonStore, config, logger }
  6b. MessageQueueManager (FIFO per-session)
  7. CronScheduler.start()
  8a. ToolApiServer.start()  → :18790 (HTTP, for OpenClaw callbacks)
  8b. AdminServer.start()    → unix socket (daemon.sock)

  Shutdown: SIGINT/SIGTERM → cron.stop → queue.dispose → relay.disconnect
            → toolApi.stop → admin.stop → facade.dispose → daemonStore.dispose
```

If `MASTER_SEED` is not set, facade is null and all WDK-dependent tools return `"WDK not initialized"`.

---

## Core Execution Flows

### Flow 1: Policy-Gated Transaction (happy path)

```
  User: "Send 100 USDC to Alice"
    │
    ▼
  App → Relay (chat channel, Redis Stream)
    │
    ▼
  Daemon chat handler → OpenClaw /v1/responses
    │
    ▼ OpenClaw decides to call erc20Transfer tool
    │
  OpenClaw → POST /api/tools/erc20Transfer { token, to, amount }
    │
    ▼ manifest pure function — no WDK call
  erc20Transfer() returns:
    { tx: { to: USDC, data: 0xa9059cbb..., value: 0x0 },
      policy: { type: 'call', permissions: { USDC: { 0xa9059cbb: [ALLOW rule] } } },
      description: "ERC-20 transfer 100..." }
    │
    ▼ OpenClaw decides to call policyRequest
    │
  policyRequest({ policies, description })
    → facade.createApprovalRequest('policy', { targetHash: policyHash(policies), ... })
    → PendingPolicyRequested event → Relay → App
    │
    ▼ App shows approval dialog, Owner signs with Ed25519
    │
  App → Relay (control channel) → Daemon
    → facade.submitApproval(signedApproval, { type: 'policy' })
    → 6-step verification (verifyApproval)
    → policy saved to SQLite (version incremented)
    → PolicyApplied event → Relay → App
    │
    ▼ OpenClaw decides to call sendTransaction
    │
  sendTransaction({ chain: "999", to: USDC, data: 0xa9059cbb..., value: "0x0" })
    → facade.getAccount("999", 0)
    → guarded middleware intercepts:
        1. journal.isDuplicate(dedupKey) → pass
        2. journal.track(intentHash)
        3. evaluatePolicy(policies, chainId, tx) → ALLOW (rule matched)
        4. rawSendTransaction(tx) → { hash, fee }
        5. journal.updateStatus → 'settled'
    → IntentProposed → PolicyEvaluated(ALLOW) → ExecutionBroadcasted events
    → pollReceipt → ExecutionSettled event
```

### Flow 2: No Policy → Rejection → Manual Approval

```
  sendTransaction(tx) without matching policy
    → evaluatePolicy → REJECT (no matching permission)
    → journal.updateStatus → 'rejected'
    → saveRejection({ reason, context, policyVersion })
    → throw PolicyRejectionError(reason, context, intentHash)
    → tool returns { status: 'rejected', reason, context }
    → OpenClaw receives rejection and explains to user
```

---

## GuardedWDK Internals

### Middleware Wrapping

`createGuardedMiddleware` monkey-patches every WDK account object:

```typescript
// Blocked methods — throw ForbiddenError immediately
account.sign          = () => { throw new ForbiddenError('sign') }
account.signTypedData = () => { throw new ForbiddenError('signTypedData') }
account.dispose       = () => { throw new ForbiddenError('dispose') }
Object.defineProperty(account, 'keyPair', { get() { throw new ForbiddenError('keyPair') } })

// Guarded methods — policy evaluation before execution
account.sendTransaction  = async (tx) => { /* evaluate → sign → broadcast */ }
account.signTransaction  = async (tx) => { /* evaluate → sign only */ }
account.transfer         = async (opts) => { /* evaluate → transfer */ }
```

The AI agent can only call guarded methods. Raw signing, key access, and disposal are physically blocked.

### Policy Evaluation (`evaluatePolicy`)

```
Input: Policy[], chainId, Transaction { to, data, value }

  1. Check TimestampPolicy (validAfter / validUntil)
  2. Find CallPolicy → PermissionDict
  3. Extract target = tx.to.toLowerCase()
  4. Extract selector = tx.data[0:10]  (4-byte function selector)
  5. Collect candidate Rules from:
     - exact target + exact selector
     - exact target + wildcard selector (*)
     - wildcard target (*) + exact selector
     - wildcard target (*) + wildcard selector (*)
  6. Sort candidates by `order` field
  7. For each candidate:
     a. Extract args from calldata: extractArg(data, index) → 32-byte hex at offset 10+index*64
     b. Match each ArgCondition using BigInt comparison:
        EQ | NEQ | GT | GTE | LT | LTE | ONE_OF | NOT_ONE_OF
     c. Check valueLimit: BigInt(tx.value) <= BigInt(rule.valueLimit)
     d. First rule where all conditions pass → return AllowResult
     e. Failed rules are collected in ruleFailures[] for rejection context

Output: AllowResult | SimpleRejectResult | DetailedRejectResult
```

`DetailedRejectResult` includes `EvaluationContext` with the exact rules that were tried and why each failed — this context is returned to the AI so it can explain the rejection to the user.

### Execution Journal

In-memory dedup index backed by SQLite (`execution_journal` table):

```
intentHash = SHA-256(chainId, to, data, value, timestamp)  — unique per intent
dedupKey   = SHA-256(chainId, to, data, value)             — same tx always = same key

Track → isDuplicate(dedupKey)?
  → yes: throw DuplicateIntentError
  → no:  track(intentHash) → status: 'received'
         → policy eval → 'rejected' | policy pass →
           execution → 'settled'(txHash) | 'failed' | 'signed'
```

On boot, `journal.recover()` loads incomplete entries from SQLite to restore the in-memory index.

---

## Approval System

### Wire Format

```typescript
// Approval payload (all fields except sig)
SignedApprovalPayload = {
  type, requestId, chainId, accountIndex, signerId,
  targetHash, policyVersion, expiresAt, nonce, content
}

// Signing process (App side — SignedApprovalBuilder):
canonicalJSON(payload)     // recursive key sort, no whitespace
  → SHA-256               // 32-byte hash
  → Ed25519.sign(hash, identityPrivateKey)
  → sig (hex string)

SignedApproval = { ...payload, sig }
```

### 6-Step Verification (`verifyApproval`)

```typescript
// Step 1: trustedApprovers.includes(approver)?        → UntrustedApproverError
// Step 2: store.isSignerRevoked(approver)?             → SignerRevokedError
// Step 3: verify(SHA-256(canonicalJSON(fields)), sig)  → SignatureError
// Step 4: expiresAt > now?                             → ApprovalExpiredError
// Step 5: nonce > store.getLastNonce(approver)?        → ReplayError
// Step 6: type-specific targetHash validation          → SignatureError
//
// All pass → store.updateNonce(approver, nonce)
```

`targetHash` meaning varies by approval type:
- `tx`: `intentHash` of the transaction
- `policy` / `policy_reject`: `policyHash` of the policies array
- `device_revoke`: `SHA-256(publicKey)` of the device being revoked
- `wallet_create` / `wallet_delete`: wallet identifier hash

### Signer Lifecycle

```
Device pairing:
  App generates Ed25519 keypair → SecureStore
  App sends device_register { publicKey, deviceId } via control channel
  Daemon: wdkStore.saveSigner(publicKey, deviceId)
        → refreshTrustedApprovers()
        → facade.setTrustedApprovers([...activePublicKeys])

Revocation:
  Owner sends device_revoke SignedApproval
  → verifyApproval (6-step, targetHash = SHA-256(targetPublicKey))
  → store marks signer as revoked (revoked_at timestamp)
  → refreshTrustedApprovers() removes from active list
```

---

## Tool Surface

`executeToolCall(name, args, ctx)` dispatches to 15 tools. Each tool returns a discriminated union:

### Tool Categories

| Category | Tools | WDK Required | Returns |
|----------|-------|--------------|---------|
| **Tx execution** | `sendTransaction`, `signTransaction` | Yes | `executed`/`signed`/`rejected`/`duplicate`/`error` |
| **Read** | `getBalance`, `getWalletAddress`, `erc20Balances` | Balance: Yes, ERC20: No (direct RPC) | `{ balances }` / `{ address }` |
| **Policy mgmt** | `policyList`, `policyPending`, `policyRequest`, `listRejections`, `listPolicyVersions` | Yes | Various query results |
| **Cron** | `registerCron`, `listCrons`, `removeCron` | No (DaemonStore) | `registered`/`removed`/`{ crons }` |
| **Manifest** | `erc20Transfer`, `erc20Approve`, `hyperlendDepositUsdt` | No (pure functions) | `{ status: 'prepared', tx, policy, description }` |

### Manifest Tool → Policy → Tx Flow

This is the canonical 3-step flow for any DeFi operation:

```typescript
// Step 1: Manifest tool (pure computation)
erc20Transfer({ token: USDC, to: alice, amount: "1000000" })
→ { tx: { to: USDC, data: "0xa9059cbb...", value: "0x0" },
    policy: { type: 'call', permissions: { [USDC]: { "0xa9059cbb": [{ order: 0, decision: 'ALLOW',
      args: { 0: { condition: 'EQ', value: alice }, 1: { condition: 'LTE', value: "1000000" } } }] } } },
    description: "ERC-20 transfer..." }

// Step 2: Policy approval (requires Owner signature)
policyRequest({ policies: [policy], description })
→ createApprovalRequest → App shows dialog → Owner signs → policy saved

// Step 3: Transaction execution (now within policy)
sendTransaction({ chain: "999", to: USDC, data: "0xa9059cbb...", value: "0x0" })
→ evaluatePolicy → ALLOW → WDK signs → on-chain
```

The policy generated in Step 1 **exactly matches** the tx in Step 3 — same target, same selector, same arg conditions. This is by construction: `erc20Transfer` builds both from the same parameters.

---

## Relay Protocol

### Channel Architecture

| Channel | Direction | Persistent | Transport | Content |
|---------|-----------|-----------|-----------|---------|
| `control` | App → Daemon | Redis Stream | XREAD BLOCK poller | 9 message types (6 approval + device_register + 2 cancel) |
| `event_stream` | Daemon → App | Redis Stream | XREAD BLOCK poller | 14 WDK events + 2 daemon events + 3 async notifications |
| `chat` | Bidirectional | Redis Stream | XREAD BLOCK poller | User/AI messages per session |
| `query` | App → Daemon | None | WS direct | Synchronous queries (balance, address, policy) |
| `query_result` | Daemon → App | None | WS direct | Query responses |

### Redis Streams = Single Source of Truth

Persistent channels go through Redis XADD → XREAD BLOCK → socket delivery. No direct WS forwarding for persistent messages. This eliminates the dual-delivery bug that existed before v0.4.8.

Each poller uses a separate Redis blocking connection to avoid head-of-line blocking.

### Control Message Types (App → Daemon)

```typescript
type ControlMessage =
  | { type: 'tx_approval';      payload: SignedApprovalFields }
  | { type: 'policy_approval';  payload: PolicyApprovalPayload }   // extends + policies
  | { type: 'policy_reject';    payload: SignedApprovalFields }
  | { type: 'device_revoke';    payload: DeviceRevokePayload }     // extends + targetPublicKey
  | { type: 'wallet_create';    payload: SignedApprovalFields }
  | { type: 'wallet_delete';    payload: SignedApprovalFields }
  | { type: 'device_register';  payload: { publicKey, deviceId } }
  | { type: 'cancel_queued';    payload: { messageId } }
  | { type: 'cancel_active';    payload: { messageId } }
```

### Reconnection

Daemon uses exponential backoff (default 1s → 30s max) with automatic re-authentication. On boot, retries up to 10 times with 3s delays to handle Docker startup ordering.

---

## Event System

GuardedWDK emits 14 typed events. Daemon subscribes to all and forwards through `event_stream`:

### Transaction Lifecycle Events

```
IntentProposed → PolicyEvaluated(ALLOW|REJECT) → ExecutionBroadcasted → ExecutionSettled
                                                                       → ExecutionFailed
                                                   TransactionSigned (sign-only flow)
```

### Approval Lifecycle Events

```
PendingPolicyRequested → ApprovalVerified → PolicyApplied
                       → ApprovalRejected
                       → ApprovalFailed
```

### Identity Events

```
SignerRevoked, WalletCreated, WalletDeleted
```

### Daemon Events (not from WDK)

```
CancelCompleted, CancelFailed, MessageQueued, MessageStarted, CronSessionCreated
```

All events carry `{ type, timestamp }` base fields. App discriminates on `type` string literal.

---

## Persistence

### WDK Store (SQLite — `$WDK_HOME/store/wdk.db`)

| Table | Primary Key | Purpose |
|-------|-------------|---------|
| `master_seed` | `id=1` (singleton) | BIP-39 mnemonic |
| `wallets` | `account_index` | BIP-44 wallets |
| `policies` | `(account_index, chain_id)` | Active policy JSON + signature + version |
| `pending_requests` | `request_id` | Approval requests awaiting Owner signature |
| `approval_history` | `id` (auto) | Audit trail of all approvals/rejections |
| `signers` | `public_key` | Registered Ed25519 public keys + revocation status |
| `nonces` | `approver` | Last-used nonce per approver (replay protection) |
| `execution_journal` | `intent_hash` | Tx lifecycle tracking + dedup keys |

File permissions: `0o600` (owner read/write only). WAL mode for concurrent read performance.

### Daemon Store (SQLite — `$WDK_HOME/daemon-store/daemon.db`)

| Table | Primary Key | Purpose |
|-------|-------------|---------|
| `crons` | `id` (UUID) | Scheduled AI tasks (interval, prompt, chain) |

### Relay Store (PostgreSQL)

Registry tables for users, daemons, devices, sessions, daemon-user bindings, refresh tokens, and enrollment codes. Schema in `packages/relay/src/registry/schema.sql`.

### Redis Streams (Relay)

Persistent message channels (control, event_stream, chat) with XTRIM max length ~10,000. Cursor-based replay for offline recovery.

---

## Configuration Reference

### Daemon (`packages/daemon/src/config.ts`)

| Env Var | Default | Description |
|---------|---------|-------------|
| `WDK_HOME` | `~/.wdk` | Root directory for all WDK data |
| `MASTER_SEED` | — | BIP-39 mnemonic (provisioned to SQLite on first boot) |
| `OPENCLAW_BASE_URL` | `http://localhost:18789` | OpenClaw Gateway URL |
| `OPENCLAW_TOKEN` | — | Gateway auth token |
| `TOOL_API_PORT` | `18790` | HTTP port for OpenClaw tool callbacks |
| `TOOL_API_TOKEN` | — | Bearer token for tool API auth |
| `EVM_RPC_URL` | `https://rpc.hyperliquid.xyz/evm` | EVM JSON-RPC endpoint |
| `RELAY_URL` | `http://localhost:3000` | Relay base URL |
| `DAEMON_ID` | — | Daemon identity for relay auth |
| `DAEMON_SECRET` | — | Daemon secret for relay auth |
| `APPROVAL_TIMEOUT_MS` | `60000` | Approval wait timeout |
| `CRON_TICK_INTERVAL_MS` | `60000` | Cron scheduler tick |
| `HEARTBEAT_INTERVAL_MS` | `30000` | Relay heartbeat |
| `RECONNECT_BASE_MS` | `1000` | Reconnect backoff start |
| `RECONNECT_MAX_MS` | `30000` | Reconnect backoff cap |

### Relay (`packages/relay/src/config.ts`)

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | HTTP/WS port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `DATABASE_URL` | `postgresql://wdk:wdk@localhost:5432/wdk_relay` | PostgreSQL connection |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing key |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `HEARTBEAT_TTL` | `30` | Daemon heartbeat TTL (seconds) |
| `STREAM_BLOCK_MS` | `5000` | XREAD BLOCK timeout |
| `STREAM_MAX_LEN` | `10000` | XTRIM approximate max |
| `RATE_LIMIT_MAX` | `100` | Requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |

### Docker Compose Services

| Service | Image | Ports | Volumes |
|---------|-------|-------|---------|
| `postgres` | `postgres:16-alpine` | — (internal) | `.docker-data/postgres` |
| `redis` | `redis:7-alpine` | — (internal) | `.docker-data/redis` |
| `openclaw` | custom Dockerfile | `18789` | `.docker-data/openclaw` |
| `relay` | custom Dockerfile | `3000` | — |
| `daemon` | custom Dockerfile | — (internal: 18790) | `.docker-data/wdk` |

---

## Development

### Quick Start

```bash
git clone <repo-url> && cd WDK-APP

# Configure
cp docker/.env.example .env
# Required: MASTER_SEED, ANTHROPIC_API_KEY

# Run infrastructure
docker compose up -d

# Mobile app (separate terminal)
cd packages/app && npx expo start
```

### CI Checks

8 static analysis checks enforce architectural invariants:

```bash
npx tsx scripts/check/index.ts                        # run all
npx tsx scripts/check/index.ts --check boundary-layer # run individual
```

Checks cover: layer boundary violations, dead exports, type dependency cycles, import rules, and more. Test fixtures in `scripts/check/__fixtures__/` provide negative test cases.

### Error Hierarchy

GuardedWDK defines 9 typed errors, each thrown at a specific point in the execution flow:

| Error | Thrown When |
|-------|-----------|
| `ForbiddenError` | AI calls blocked method (sign, keyPair, dispose) |
| `PolicyRejectionError` | Transaction fails policy evaluation |
| `DuplicateIntentError` | Same dedupKey already in journal |
| `ApprovalTimeoutError` | Owner doesn't respond within timeout |
| `SignatureError` | Ed25519 verification fails |
| `UntrustedApproverError` | Approver not in trusted list |
| `SignerRevokedError` | Approver's key was revoked |
| `ApprovalExpiredError` | Approval past expiresAt |
| `ReplayError` | Nonce <= last used nonce |

---

## License

Apache License 2.0 — see [LICENSE](LICENSE)
