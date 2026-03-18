# 설계 - v0.1.0

## 변경 규모
**규모**: 서비스 경계
**근거**: 6개 패키지 (guarded-wdk 확장 + canonical + manifest + daemon + relay + app), 외부 API (OpenClaw, Redis, PostgreSQL), E2E 암호화, 모바일 앱, docker-compose

---

## 문제 요약
Guarded WDK v0.0.1은 순수 라이브러리. AI agent + 모바일 owner + 개인 서버 시나리오를 위한 전체 스택이 없음.

> 상세: [README.md](README.md) 참조

## 접근법

**6개 패키지를 모노레포에서 순차 구현.** PRD에서 확정된 아키텍처(3-tier Relay, Unified SignedApproval, daemon-managed function calling)를 그대로 구현.

핵심 전략:
1. Guarded WDK를 breaking change로 확장 (SignedApprovalBroker)
2. Daemon이 WDK를 호스팅하고 OpenClaw에 tool로 노출
3. Relay가 메시지 중계 (E2E 암호화, Redis Streams + PostgreSQL)
4. RN App이 identity key로 SignedApproval 생성 (HypurrQuant 패턴 차용)
5. Manifest는 policy 카탈로그 (WDK가 직접 사용하지 않음)

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: WDK 내부에 모든 것 (signing + relay + app logic) | 단일 패키지 | 책임 과다, 테스트 어려움 | ❌ |
| B: 6 패키지 모노레포 (관심사 분리 + canonical 공유) | 책임 명확, 독립 테스트, 독립 배포, 해시 일관성 보장 | 패키지 간 인터페이스 설계 필요 | ✅ |
| C: 멀티 레포 | 완전 분리 | 버전 동기화 어려움, 공유 타입 관리 복잡 | ❌ |

**선택 이유**: B. 각 패키지가 단방향 의존. canonical은 해시 일관성의 단일 구현, WDK/daemon/app/manifest가 모두 import. relay는 독립 (canonical 불필요).

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| Ed25519 라이브러리 | tweetnacl (또는 @noble/ed25519) | 배틀 테스트, 순수 JS, 번들 작음 |
| SQLite 라이브러리 | better-sqlite3 | 동기 API, Node.js 표준 |
| canonical JSON | packages/canonical (공유 패키지) — sortKeysDeep + SHA-256 | guarded-wdk, daemon, app 모두 이 패키지를 import. 해시 drift 방지 |
| Relay HTTP 프레임워크 | Fastify | 고성능, 플러그인 아키텍처 |
| Relay WebSocket | @fastify/websocket (ws 래핑) | Fastify 통합 |
| Redis 클라이언트 | ioredis | Streams 지원, 안정성 |
| PostgreSQL 클라이언트 | pg (node-postgres) | 가벼움, 직접 쿼리 |
| RN 프레임워크 | Expo (managed) | 빠른 셋업, SecureStore 내장 |
| 상태 관리 | zustand | HypurrQuant 패턴, 경량 |
| identity key 저장 | expo-secure-store | iOS Keychain / Android Keystore |

---

## 범위 / 비범위

**범위 (In Scope)**:
- Guarded WDK 확장: SignedApprovalBroker, approval-verifier, ApprovalStore (JSON + SQLite), 다중 seed, 새 에러 5종, 새 이벤트 5종
- Daemon: tool surface (agent 9개 + admin), Relay WS Client, Execution Journal, Cron Scheduler, OpenClaw SDK 통합
- Relay: Redis Streams 큐 (chat_queue + control_channel), PostgreSQL 레지스트리, Fastify HTTP/WS, 푸시 알림, docker-compose
- RN App: 6탭 (Chat, Policy, Approval, Activity, Dashboard, Settings), E2E pairing (SAS/QR), SignedApproval 생성, HypurrQuant 패턴
- Manifest: getPolicyManifest() 규격, manifestToPolicy() 변환, canonicalization 공유

**비범위 (Out of Scope)**:
- DeFi helper tool, 멀티체인 구현, seed 암호화, 멀티유저, 온체인 policy, AI OS 탈출 방어

## 가정/제약

1. OpenClaw는 OpenAI 호환 API를 안정적으로 제공 (localhost:18789)
2. Ed25519 서명/검증이 RN App (JS)과 daemon (Node.js)에서 동일하게 동작
3. Expo SecureStore는 identity key를 안전하게 보관 (OS Keychain 래핑)
4. Redis Streams는 메시지 순서를 보장
5. 개인 서버는 단일 daemon 프로세스 (복수 daemon은 Phase 2)
6. **다중 seed 의미론**: seed 전환 시 seed별 policy/pending/cron/journal/history를 모두 보존. DB 스키마에 `seed_id` FK로 분리. 한 번에 하나의 active seed만 WDK에 로드 (전환 시 dispose → 새 seed로 재생성)

---

## 아키텍처 개요

### 패키지 의존 방향 (단방향)

```
app ──► canonical (해시 계산. manifest 의존 없음 — policy JSON만 표시/승인)
daemon ──► guarded-wdk, canonical
DeFi CLI ──► manifest, canonical (--policy로 policy JSON 생성)
guarded-wdk ──► canonical (해시 계산)
manifest ──► canonical
relay ──► (독립 — 메시지만 중계, canonical 불필요)
```

### 모듈 구조 (패키지별)

#### guarded-wdk (확장)

```
src/guarded/
  index.js                       -- 기존 + 새 export
  guarded-wdk-factory.js         -- 기존 + ApprovalStore, trustedApprovers
  guarded-middleware.js           -- 기존 (broker 호출 부분만 수정)
  errors.js                      -- +5 에러
  signed-approval-broker.js      -- 🔨 SignedApprovalBroker
  approval-verifier.js           -- 🔨 6단계 검증
  approval-store.js              -- 🔨 추상 인터페이스
  json-approval-store.js         -- 🔨 JSON 구현
  sqlite-approval-store.js       -- 🔨 SQLite 구현
  approval-broker.js             -- ❌ 삭제

  # canonical.js는 guarded-wdk에 두지 않음.
  # packages/canonical에서 공유. guarded-wdk, daemon, app이 모두 import.
```

#### daemon

```
src/
  index.js                       -- 진입점 (daemon 시작)
  config.js                      -- 설정 로드 (env, config file)
  wdk-host.js                    -- WDK 초기화 + seed 로드
  tool-surface.js                -- OpenClaw tool 정의 (agent surface)
  openclaw-client.js             -- OpenAI SDK 래퍼 (session 매핑)
  relay-client.js                -- Relay WS 연결 + 재연결
  control-handler.js             -- control_channel 메시지 처리
  chat-handler.js                -- chat_queue 메시지 처리
  cron-scheduler.js              -- Cron 등록/실행/영속
  execution-journal.js           -- intentId dedupe
  admin-server.js                -- 로컬 Unix socket (wdk-admin)
```

#### relay

```
src/
  index.js                       -- Fastify 서버 시작
  config.js                      -- 설정 (Redis, PostgreSQL, 포트)
  routes/
    auth.js                      -- 인증 (JWT)
    ws.js                        -- WebSocket 업그레이드 (daemon + app)
    push.js                      -- 푸시 알림 발송
  queue/
    queue-adapter.js             -- 추상 인터페이스
    redis-queue.js               -- Redis Streams 구현
  registry/
    registry-adapter.js          -- 추상 인터페이스
    pg-registry.js               -- PostgreSQL 구현
  middleware/
    rate-limit.js
    cors.js
docker-compose.yml               -- relay + redis + postgres
```

#### app (RN, Expo)

```
src/
  app/
    App.tsx                      -- 진입점
    providers/AppProviders.tsx    -- 전역 Provider 트리
    RootNavigator.tsx             -- 탭 네비게이션
  core/
    relay/
      RelayClient.ts             -- Relay WS/REST 연결
      E2ECrypto.ts               -- ECDH + Ed25519
      PairingService.ts          -- QR + SAS
    approval/
      SignedApprovalBuilder.ts   -- SignedApproval 생성
      types.ts                   -- SignedApproval, UnsignedIntent 타입
    identity/
      IdentityKeyManager.ts     -- SecureStore CRUD
  shared/
    tx/
      TxApprovalContext.tsx      -- 상태 머신 (HypurrQuant 차용)
      TxApprovalSheet.tsx        -- 바텀시트 UI
    ui/                          -- 공유 컴포넌트
  domains/
    chat/screens/ChatScreen.tsx
    policy/screens/PolicyScreen.tsx
    approval/screens/ApprovalScreen.tsx
    activity/screens/ActivityScreen.tsx
    dashboard/screens/DashboardScreen.tsx
    settings/screens/SettingsScreen.tsx
  stores/
    useWalletStore.ts
    usePolicyStore.ts
    useApprovalStore.ts
    useActivityStore.ts
```

#### canonical (공유 패키지, 새로 추가)

```
src/
  index.js                       -- sortKeysDeep, intentHash, policyHash, canonicalJSON
  # guarded-wdk, daemon, app, manifest 모두 이 패키지를 import
  # 해시 drift 방지를 위한 단일 구현
```

#### manifest

```
src/
  index.js                       -- 공개 API
  types.js                       -- Manifest, Feature, Call, Approval 타입
  manifest-to-policy.js          -- manifest → WDK policy 변환
  # canonicalization은 @wdk-app/canonical에서 import
```

---

## 데이터 흐름

### Flow 1: AI tx 실행 (AUTO)

```
① RN App → Relay chat_queue → daemon
② daemon → OpenClaw API (POST /v1/chat/completions, user: userId:sessionId, tools: agent surface)
③ OpenClaw → tool_call { name: 'sendTransaction', arguments: { chain, to, data, value } }
④ daemon → tool-surface.js → wdk-host.js → guarded-middleware.js
   → evaluatePolicy() → AUTO
⑤ guarded-middleware.js → rawSendTransaction(tx)
⑥ daemon → tool result { status: 'executed', hash, fee } → OpenClaw
⑦ OpenClaw → 응답 메시지 → daemon → Relay chat_queue → RN App
   + Execution Journal: received → evaluated → broadcasted → settled
   + 이벤트: IntentProposed → PolicyEvaluated → ExecutionBroadcasted → ExecutionSettled
```

### Flow 2: tx 승인 (REQUIRE_APPROVAL)

```
① ~ ③ Flow 1과 동일
④ evaluatePolicy() → REQUIRE_APPROVAL
⑤ SignedApprovalBroker.createRequest({ type: 'tx', targetHash: intentHash, ... })
⑥ daemon → Relay control_channel (승인 요청) → RN App 푸시
⑦ daemon → tool result { status: 'pending_approval', requestId } → OpenClaw
⑧ owner → RN App → SignedApproval 생성 (identity key)
⑨ RN App → Relay control_channel → daemon
⑩ daemon → SignedApprovalBroker.submitApproval(signedApproval)
   → approval-verifier.js: 6단계 검증
   → Promise resolve
⑪ guarded-middleware.js → rawSendTransaction(tx)
⑫ daemon → 후속 결과 → OpenClaw → Relay → RN App
```

### Flow 3: policy 요청 → 승인

```
① OpenClaw → tool_call { name: 'sendTransaction' } → REJECT
② daemon → tool result { status: 'rejected' } → OpenClaw
③ OpenClaw → tool_call { name: 'policyRequest', arguments: { chain, reason, policies } }
④ daemon → SignedApprovalBroker.createRequest({ type: 'policy', targetHash: policyHash })
   → pending 저장
⑤ OpenClaw → 사용자 메시지 → Relay → RN App
   + Relay control_channel (pending 알림)
⑥ owner → RN App → SignedApproval { type: 'policy' }
⑦ RN App → Relay control_channel → daemon
⑧ SignedApprovalBroker.submitApproval()
   → 6단계 검증 → WDK countersign → ApprovalStore 저장 → updatePolicies()
⑨ OpenClaw → 재시도 → policy 있음 → 서명 → 제출
```

---

## API/인터페이스 계약

### 패키지 간 인터페이스

#### daemon → guarded-wdk

```javascript
import { createGuardedWDK, SignedApprovalBroker, SqliteApprovalStore } from '@wdk-app/guarded-wdk'

const store = new SqliteApprovalStore('~/.wdk/store/wdk.db')
const broker = new SignedApprovalBroker(trustedApprovers, store)
const wdk = createGuardedWDK({ seed, wallets, protocols, policies: {}, approvalBroker: broker, approvalStore: store })

// Tool 실행
const account = await wdk.getAccount('ethereum', 0)
const result = await account.sendTransaction({ to, data, value })

// Policy 요청
broker.createRequest('policy', { chain, targetHash: policyHash, requestId, metadata: { reason, policies } })

// 승인 제출 (Relay에서 수신)
broker.submitApproval(signedApproval)
```

#### daemon → OpenClaw

**Agent Surface (9개 tool)**:

| # | tool name | parameters | return (Tool Result) |
|---|-----------|------------|---------------------|
| 1 | sendTransaction | { chain, to, data, value } | executed / pending_approval / rejected / error |
| 2 | transfer | { chain, token, to, amount } | executed / pending_approval / rejected / error |
| 3 | getBalance | { chain } | { balances: [...] } |
| 4 | policyList | { chain } | { policies: [...] } |
| 5 | policyPending | { chain } | { pending: [...] } |
| 6 | policyRequest | { chain, reason, policies } | { requestId, status: 'pending' } |
| 7 | registerCron | { interval, prompt, chain, sessionId } | { cronId, status: 'registered' } |
| 8 | listCrons | {} | { crons: [...] } |
| 9 | removeCron | { cronId } | { status: 'removed' } |

**Admin Surface (tool 미등록 — AI 접근 불가)**:
- policyApprove, deviceRevoke, journalList, status, deviceList

```javascript
import OpenAI from 'openai'
const client = new OpenAI({ baseURL: 'http://localhost:18789', apiKey: token })

const response = await client.chat.completions.create({
  model: 'default',
  user: `${userId}:${sessionId}`,
  messages: [...],
  tools: [
    { type: 'function', function: { name: 'sendTransaction', parameters: { type: 'object', properties: { chain: { type: 'string' }, to: { type: 'string' }, data: { type: 'string' }, value: { type: 'string' } }, required: ['chain', 'to', 'data', 'value'] } } },
    { type: 'function', function: { name: 'transfer', parameters: { type: 'object', properties: { chain: { type: 'string' }, token: { type: 'string' }, to: { type: 'string' }, amount: { type: 'string' } }, required: ['chain', 'token', 'to', 'amount'] } } },
    { type: 'function', function: { name: 'getBalance', parameters: { type: 'object', properties: { chain: { type: 'string' } }, required: ['chain'] } } },
    { type: 'function', function: { name: 'policyList', parameters: { type: 'object', properties: { chain: { type: 'string' } }, required: ['chain'] } } },
    { type: 'function', function: { name: 'policyPending', parameters: { type: 'object', properties: { chain: { type: 'string' } }, required: ['chain'] } } },
    { type: 'function', function: { name: 'policyRequest', parameters: { type: 'object', properties: { chain: { type: 'string' }, reason: { type: 'string' }, policies: { type: 'array' } }, required: ['chain', 'reason', 'policies'] } } },
    { type: 'function', function: { name: 'registerCron', parameters: { type: 'object', properties: { interval: { type: 'string' }, prompt: { type: 'string' }, chain: { type: 'string' }, sessionId: { type: 'string' } }, required: ['interval', 'prompt', 'chain', 'sessionId'] } } },
    { type: 'function', function: { name: 'listCrons', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'removeCron', parameters: { type: 'object', properties: { cronId: { type: 'string' } }, required: ['cronId'] } } },
  ]
})

// tool_call 처리
for (const toolCall of response.choices[0].message.tool_calls) {
  const result = await executeToolCall(toolCall)  // WDK 호출
  // result를 다음 메시지로 OpenClaw에 반환
}
```

#### daemon → Relay

```javascript
// outbound WebSocket
const ws = new WebSocket('wss://relay.wdk-app.com/ws')
ws.send(JSON.stringify({
  type: 'authenticate',
  payload: { userId, token }
}))

// 메시지 수신 (control_channel + chat_queue)
ws.on('message', (data) => {
  const msg = JSON.parse(data)
  if (msg.channel === 'control') controlHandler.handle(msg)
  if (msg.channel === 'chat') chatHandler.handle(msg)
})

// 메시지 전송
ws.send(JSON.stringify({
  channel: 'chat',
  sessionId: 'session_abc',
  payload: encryptedMessage  // E2E
}))
```

#### RN App → Relay

```javascript
// REST: 인증
POST /api/auth/login { userId, password }
POST /api/auth/pair { pairingCode, publicKey }

// WebSocket: 실시간
const ws = new WebSocket('wss://relay.wdk-app.com/ws/app')

// 승인 전송
ws.send(JSON.stringify({
  channel: 'control',
  payload: encrypt(signedApproval)  // E2E
}))

// 이벤트 수신
ws.on('message', (data) => { /* control + chat */ })
```

---

## 데이터 모델/스키마

### ApprovalStore (SQLite)

```sql
-- Active policies (seed_id + chain 복합키)
CREATE TABLE policies (
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  chain TEXT NOT NULL,
  policies_json TEXT NOT NULL,
  signature_json TEXT NOT NULL,
  wdk_countersig TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (seed_id, chain)
);

-- Pending requests (policy + tx, seed별 분리)
CREATE TABLE pending_requests (
  request_id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  type TEXT NOT NULL,            -- 'tx' | 'policy' | 'policy_reject' | 'device_revoke'
  chain TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

-- Approval history (seed별 분리)
CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  type TEXT NOT NULL,
  chain TEXT,
  target_hash TEXT NOT NULL,
  approver TEXT NOT NULL,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,          -- 'approved' | 'rejected' | 'requested'
  signed_approval_json TEXT,
  timestamp INTEGER NOT NULL
);

-- Devices
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  name TEXT,
  paired_at INTEGER NOT NULL,
  revoked_at INTEGER              -- NULL = active
);

-- Nonce tracking
CREATE TABLE nonces (
  approver TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_nonce INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (approver, device_id)
);

-- Cron jobs (seed별 분리)
CREATE TABLE crons (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  session_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  prompt TEXT NOT NULL,
  chain TEXT,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Execution Journal (중복 실행 방지, daemon 재시작 후 복구)
CREATE TABLE execution_journal (
  intent_id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  chain TEXT NOT NULL,
  target_hash TEXT NOT NULL,       -- intentHash
  status TEXT NOT NULL,            -- 'received' | 'evaluated' | 'approved' | 'broadcasted' | 'settled' | 'failed'
  tx_hash TEXT,                    -- broadcasted 이후 채워짐
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Seeds
CREATE TABLE seeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mnemonic TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);
```

### Relay PostgreSQL

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices (라우팅용, 보안 판단 아님)
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,           -- 'daemon' | 'app'
  push_token TEXT,              -- Expo push token (app only)
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
```

---

## 테스트 전략

### 단위 테스트 (guarded-wdk)

| 대상 | 테스트 내용 |
|------|-----------|
| approval-verifier.js | 6단계 검증 각각, 에러 케이스, nonce replay, cross-chain replay |
| signed-approval-broker.js | createRequest, submitApproval, waitForApproval, timeout |
| canonical.js | sortKeysDeep, intentHash, policyHash — 엣지케이스 |
| json-approval-store.js | CRUD 전체, 파일 생성/로드, 동시성 |
| sqlite-approval-store.js | CRUD 전체, 트랜잭션, 마이그레이션 |
| errors.js | 새 에러 5종 |

기존 43개 테스트: broker 호출 부분만 SignedApprovalBroker로 마이그레이션.

### 통합 테스트 (daemon)

| 시나리오 | 검증 |
|---------|------|
| tool_call → sendTransaction → AUTO | 전체 파이프라인 |
| tool_call → REQUIRE_APPROVAL → 승인 → 실행 | SignedApproval 흐름 |
| tool_call → REJECT → policyRequest → 승인 → 재시도 | policy 요청 흐름 |
| Execution Journal dedupe | 동일 intentId 중복 제출 |
| Cron 등록 → 주기 실행 | Cron 스케줄러 |
| daemon 재시작 후 복구 | ApprovalStore 영속 |

### E2E 테스트

| 시나리오 | 범위 |
|---------|------|
| RN App pairing → policy 승인 → tx 실행 | App ↔ Relay ↔ daemon 전체 |
| device revoke → 서명 거부 | revocation 흐름 |

---

## 실패/에러 처리

| 상황 | 처리 |
|------|------|
| verifyApproval 실패 | 해당 에러 throw + ApprovalRejected 이벤트 |
| Approval 타임아웃 (60초) | ApprovalTimeoutError + ExecutionFailed 이벤트 |
| Policy REJECT | PolicyRejectionError + tool result { status: 'rejected' } |
| sendTransaction 실패 | 원본 에러 전파 + ExecutionFailed 이벤트 |
| Relay WebSocket 끊김 | exponential backoff 재연결 + 마지막 Stream ID로 누락분 수신 |
| OpenClaw API 오류 | 재시도 (3회) → 실패 시 사용자에게 에러 전달 |
| ApprovalStore I/O 오류 | 에러 로깅 + 재시도 → 실패 시 daemon 중단 |
| 중복 intentId | Execution Journal에서 무시 (idempotent) |

---

## 성능/스케일

| 항목 | 목표 |
|------|------|
| tool_call 응답 | < 100ms (policy 평가) |
| SignedApproval 검증 | < 10ms (Ed25519 verify) |
| Relay 메시지 전달 | < 50ms (Redis Streams) |
| 동시 사용자 | 단일 daemon = 1 user, Relay = 1000+ users |
| 메시지 큐 TTL | 24시간 |
| Approval 타임아웃 | 60초 |

---

## 롤아웃/롤백

- **배포 단위**: 각 패키지 독립 (guarded-wdk → daemon → relay → app)
- **Relay**: docker-compose pull + up (zero-downtime은 Phase 2)
- **Daemon**: 프로세스 재시작 (ApprovalStore에서 복구)
- **App**: Expo OTA update
- **롤백**: git revert + 재배포. ApprovalStore는 하위 호환 (스키마 migration 관리)

---

## 관측성

| 항목 | 구현 |
|------|------|
| daemon 로그 | stdout (JSON format), 레벨: info/warn/error |
| Relay 로그 | Fastify pino (기본 JSON) |
| 이벤트 스트림 | Guarded WDK 11종 이벤트 → Relay → RN App Activity 탭 |
| daemon 상태 | wdk-admin status (로컬) + Relay heartbeat (원격) |
| Redis 모니터링 | redis-cli monitor (개발), Redis Insight (운영) |

---

## 보안/권한

| 항목 | 설계 |
|------|------|
| Seed 보호 | DB 파일 chmod 600, privileged user only |
| Identity Key | Expo SecureStore (OS Keychain) |
| E2E 암호화 | 인증된 ECDH + SAS/QR. Relay blind transport |
| 서명 검증 | WDK 내부 6단계, daemon/AI 우회 불가 |
| Tool 경계 | agent surface만 tool 등록, admin은 미등록 |
| Replay 방지 | nonce (per-approver-per-device) + expiresAt |
| Cross-chain | chain 필드가 서명에 포함 |
| Device revocation | daemon 로컬이 소스 오브 트루스 |

---

## Ownership Boundary

| 패키지 | 책임 |
|--------|------|
| canonical | 해시 계산 — sortKeysDeep, intentHash, policyHash. 모든 패키지가 import |
| guarded-wdk | 서명 엔진 — 검증, 서명, 영속 저장 |
| daemon | 오케스트레이션 — WDK 호스팅, OpenClaw 관리, Relay 연결 |
| relay | 메시지 중계 — 큐, 라우팅, 푸시. payload 모름 |
| app | 사용자 인터페이스 — 승인, 대화, 대시보드 |
| manifest | DeFi CLI용 프로토콜 카탈로그 — manifest 규격, --policy로 policy 변환. RN App은 소비하지 않음 |

## Contract Reference

| 계약 | 문서 위치 |
|------|----------|
| SignedApproval envelope | `docs/PRD.md` (Signed Envelope Spec) |
| verifyApproval 6단계 | `docs/PRD.md` (검증 로직) |
| ApprovalStore 인터페이스 | `docs/PRD.md` (영속 저장) |
| Tool Result Schema | `docs/PRD.md` (Tool Result Schema) |
| intentHash / policyHash | `docs/PRD.md` (Unsigned Intent Spec / Policy Hash Spec) |
| Control Queue Spec | `docs/PRD.md` (Control Queue Spec) |
| OpenClaw API | `docs/openclaw-api-spec.md` |

## Dependency Map

| 의존 대상 | 영향 방향 | 영향 범위 |
|----------|----------|----------|
| OpenClaw API | daemon → OpenClaw | AI 전략 실행 |
| Redis | relay → Redis | 메시지 큐 전체 |
| PostgreSQL | relay → PG | 인증, 디바이스 레지스트리 |
| Expo Push | relay → Expo | 푸시 알림 |
| tweetnacl/noble | guarded-wdk, app → lib | Ed25519 서명/검증 |
| better-sqlite3 | guarded-wdk → lib | 로컬 DB |
| @tetherto/wdk | guarded-wdk → wdk | 지갑 코어 |

---

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| OpenClaw API가 불안정하면 daemon 전체 영향 | 높음 | 재시도 로직 + mock mode |
| E2E 암호화 구현 복잡도 | 중간 | Phase 1은 SAS 검증 + tweetnacl. Phase 2에서 강화 |
| RN App에서 Ed25519 성능 | 낮음 | tweetnacl은 JS pure, 10ms 미만 |
| better-sqlite3의 네이티브 빌드 | 중간 | prebuild 사용. 대안: sql.js (WASM) |
| Expo managed workflow 제약 | 중간 | expo-secure-store는 기본 지원. 네이티브 모듈 필요 시 dev client |
