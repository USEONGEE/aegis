# WDK-APP PRD

## 제품명
WDK-APP — AI DeFi Agent 서명 엔진 + 제어 인프라

## 한 줄 정의
WDK 기반 AI 지갑 서명 엔진과 인프라. AI agent가 DeFi CLI로 tx를 만들고, WDK로 서명하고, owner가 모바일에서 policy와 승인을 관리한다.

---

## 핵심 인사이트

**WDK는 서명 엔진이다. DeFi 로직은 WDK의 책임이 아니다.**

```
AI가 swap 하고 싶다
  → swap CLI로 tx를 만든다 (DeFi 로직은 별도 CLI)
  → WDK에 tx를 넘긴다
  → WDK가 policy 평가 → 서명 → 제출
  → 끝.
```

WDK는 tx 안에 뭐가 있는지 신경 안 씀. `target + selector + args`가 policy에 매칭되면 서명, 안 되면 거부.

---

## 역할 정의

```
daemon   = thin orchestration host. WDK 호스팅 + OpenClaw 관리 + Relay 브릿지.
           seed 보유, countersign 수행, Execution Journal 유지.
           핵심 신뢰 경계이자 실행 호스트.
OpenClaw = AI agent. daemon이 OpenAI function calling으로 WDK tool을 등록.
           AI가 tool_call 반환 → daemon이 WDK 라이브러리 직접 호출.
           별도 CLI 프로세스 없음. seed 접근 불가.
WDK      = 서명 엔진 (순수 라이브러리). policy 평가 + 서명 + 승인 검증.
DeFi CLI = tx 생성기 (별도). swap/lending/perp 등 프로토콜별.
Relay    = 중앙 서버. 메시지 큐. E2E 암호화로 payload 복호화 불가.
RN App   = owner 제어판. identity key 보유 (Expo SecureStore).
```

**핵심 원칙:**
1. **AI는 policy를 요청할 수 있지만, 승인할 수 없다.**
2. **WDK는 서명 엔진이다. DeFi 로직은 별도 CLI가 담당한다.**
3. **tx 승인과 policy 승인은 동일한 보안 모델이다 (Unified Signed Approval).**

---

## 시스템 아키텍처

### 3-tier 구조 (Relay 패턴)

```
┌──────────────┐              ┌───────────────────┐              ┌─────────────────────────────┐
│ RN App       │              │ Relay Server      │              │ 사용자 개인 서버 (집/VPS)      │
│ (owner 폰)   │ ◄──push───  │ (우리 중앙 서버)    │ ◄──outbound  │                             │
│              │  ──WS/REST─► │                   │    WebSocket─►│  daemon (privileged user)    │
│              │              │                   │              │    ├─ Guarded WDK (라이브러리) │
│ identity key │              │ - 메시지 큐 적재   │              │    ├─ Execution Journal       │
│ (SecureStore)│              │ - 푸시 알림 발송   │              │    └─ Relay WS Client         │
│              │              │ - seed/키 모름     │              │                             │
│              │              │ - E2E 복호화 불가  │              │  OpenClaw (localhost:18789)   │
│              │              │                   │              │    daemon이 tool_call 수신    │
│              │              │                   │              │    → WDK 직접 호출 (CLI 없음) │
└──────────────┘              └───────────────────┘              └─────────────────────────────┘
```

**OS 수준 격리**: daemon=privileged user (seed DB 접근 가능). `~/.wdk/store/wdk.db`는 `chmod 600` privileged only. OpenClaw는 daemon이 tool로 노출한 함수만 호출 가능 — seed/DB/파일시스템 직접 접근 없음.

**왜 이 구조인가:**
1. 개인 서버에 포트 오픈/공인 IP 불필요 — NAT/방화벽 뒤에서도 동작
2. Relay 서버는 메시지만 중계 — seed, 키, 지갑 상태를 절대 모름 (E2E 암호화)
3. 개인 서버 → Relay로 outbound WebSocket — 실시간 양방향 통신
4. Unix 파일 권한으로 seed 보호 — 컨테이너 없이도 OS 수준 격리

### 레이어 구조

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Guarded WDK (서명 엔진, @tetherto/wdk)          │
│ ├─ policy 평가 + 서명 + 이벤트 (✅ 완료)                  │
│ ├─ Unified Signed Approval (🔨 breaking change)         │
│ ├─ 영속 저장 + 로컬 DB (🔨 확장)                          │
│ └─ WDK CLI — agent surface + admin surface 분리 (🔨 신규)│
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│ Layer 2: Protocol Adapter (공유 패키지)                    │
│ Manifest = policy 생성용 카탈로그                          │
│ (WDK가 직접 사용하지 않음, 사용자 참고용)                    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│ Layer 3: Daemon (사용자 개인 서버)                         │
│ thin orchestration host — WDK 호스팅 + OpenClaw 관리      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│ Layer 4: Control Plane (우리 중앙 서버)                    │
│ Relay — session chat queue + user control channel        │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│ Layer 5: Clients                                        │
│ RN App — policy/tx 승인, dashboard                       │
│ CLI — agent surface (AI용) + admin surface (관리자용)     │
└─────────────────────────────────────────────────────────┘
```

---

## 핵심 흐름

### Flow 1: AI가 DeFi 실행 (policy 있음)

```
① 사용자: "Aave health factor 감시해줘" (RN App → Relay → daemon)
② daemon → OpenClaw API에 전달 (POST /v1/chat/completions, user: userId:sessionId)
③ OpenClaw: tool_call 반환 { name: 'sendTransaction', arguments: { to, data, value, chain } }
④ daemon: WDK 라이브러리 직접 호출 → policy 평가 → AUTO → 서명 → 제출
⑤ daemon: tool 결과를 OpenClaw에 반환 → OpenClaw가 사용자 응답 생성
⑥ daemon → Relay → RN App
```

### Flow 2: tx 승인 필요 (REQUIRE_APPROVAL)

```
① OpenClaw: tool_call { name: 'sendTransaction', ... }
② daemon → WDK: policy 평가 → REQUIRE_APPROVAL
③ SignedApprovalBroker.createRequest({ type: 'tx', targetHash: intentHash })
④ daemon → Relay (control channel) → RN App 푸시
⑤ owner: RN App에서 tx 내용 확인 → identity key로 SignedApproval 생성
⑥ RN App → Relay (control channel) → daemon
⑦ SignedApprovalBroker.submitApproval(signedApproval)
   → verifyApproval() 통과 → Promise resolve
⑧ Guarded WDK: 서명 → 제출
```

### Flow 3: AI가 policy 요청 → 승인

```
① OpenClaw: tool_call { name: 'sendTransaction', ... }
② daemon → WDK: policy 평가 → REJECT (policy 없음) → 결과를 OpenClaw에 반환
③ OpenClaw: tool_call { name: 'policyRequest', arguments: { chain, reason, policies } }
   → daemon → WDK: pending policy 저장
④ OpenClaw: 사용자에게 메시지 작성 → daemon → Relay → RN App
⑤ owner: pending policy 확인 → identity key로 SignedApproval 생성
   { type: 'policy', targetHash: policyHash, ... }
⑥ RN App → Relay (control channel) → daemon
⑦ SignedApprovalBroker.submitApproval(signedApproval)
   → verifyApproval() 통과 → WDK countersign → 영속 저장 → updatePolicies()
⑧ OpenClaw: 재시도 tool_call → policy 있음 → 서명 → 제출
```

### Flow 4: owner 직접 제어 (policy 수정, device revoke)

```
① RN App에서 작업 → identity key로 SignedApproval 생성
② RN App → Relay (control channel) → daemon
③ daemon → WDK: verifyApproval() → 적용
```

**control channel은 user 스코프** — 세션과 무관하게 동작.

---

## Unified Signed Approval (핵심 설계)

### Unsigned Intent Spec (tx 규격)

DeFi CLI든 AI든 누가 tx를 만들어도, WDK는 동일한 포맷을 받음:

```javascript
UnsignedIntent = {
  chain: 'ethereum',       // 체인 식별자
  to: '0x...',             // contract address (lowercase)
  data: '0x...',           // calldata (lowercase)
  value: '0'               // native value in wei (decimal string)
}
```

**intentHash 계산 (canonical)**:
```javascript
intentHash = SHA-256(JSON.stringify(
  { chain, to: to.toLowerCase(), data: data.toLowerCase(), value: String(value) },
  Object.keys(obj).sort()  // 키 알파벳 정렬
))
```

gas, nonce, from은 WDK/daemon이 채움. AI가 지정하지 않음.
intentHash는 `chain + to + data + value`만으로 결정 — 같은 필드면 같은 hash.
SignedApproval의 `targetHash`와 일치 검증에 사용.

### Policy Hash Spec

```javascript
// Policy 배열의 canonical hash
policyHash = SHA-256(JSON.stringify(
  policies.map(p => sortKeysDeep(p)),  // 모든 중첩 객체의 키 알파벳 정렬 (재귀적)
  null, 0                               // 공백 없음
))

// 정규화 규칙 (intentHash와 동일 원칙):
// - 모든 객체 키: 알파벳 정렬 (재귀적)
// - address 값: lowercase
// - 숫자 값: decimal string ("1000", not "0x3e8")
// - 빈 객체/배열: 그대로 유지 ({}, [])
```

WDK, daemon, app이 동일한 `sortKeysDeep` + `JSON.stringify` 구현을 사용해야 함. `packages/canonical`에서 제공.

### Tool Result Schema

daemon이 OpenClaw에 반환하는 tool 결과 구조:

```javascript
// AUTO — 즉시 실행 성공
{ status: 'executed', hash: '0x...', fee: '...', chain: 'ethereum' }

// REQUIRE_APPROVAL — 승인 대기 중
{ status: 'pending_approval', requestId: 'req_123',
  message: 'Owner approval required. Waiting...' }
// → daemon이 승인 완료 시 후속 메시지로 결과 전달

// REJECT — policy 거부
{ status: 'rejected', reason: 'no matching permission',
  message: 'Policy does not allow this transaction.' }
// → OpenClaw가 policyRequest tool_call로 policy 요청 가능

// ERROR — 실행 실패
{ status: 'error', error: 'insufficient funds', message: '...' }
```

OpenClaw는 `status`로 분기:
- `executed` → 사용자에게 결과 보고
- `pending_approval` → "승인 대기 중" 알림
- `rejected` → `policyRequest` tool_call로 policy 요청
- `error` → 에러 보고 또는 재시도 판단

### Phase 1 DeFi Tool Contract

**Phase 1: AI가 raw tx calldata를 직접 구성. 별도 DeFi tool 등록 없음.**

AI(OpenClaw)는 DeFi 프로토콜 ABI를 알고 있으므로 calldata를 직접 encode해서 `sendTransaction`에 넘김:

```
OpenClaw: "repay 500 USDC on Aave"
  → AI 내부: ABI encode → to=aavePool, data=repay(USDC,500e6,2,user), value=0
  → tool_call: { name: 'sendTransaction', arguments: { chain, to, data, value } }
  → daemon → WDK → policy 평가 → 서명 → 제출
```

WDK는 calldata 내용을 해석하지 않음. `target + selector + args`가 policy에 매칭되는지만 평가.

Phase 2+에서 DeFi helper tool 추가 가능 (`aaveRepay`, `uniswapSwap` 등 — ABI encode를 대신 해주는 convenience tool).

### Signed Envelope Spec

**tx 승인이든 policy 승인이든 동일한 envelope.**

```javascript
SignedApproval = {
  // 무엇
  type: 'tx' | 'policy' | 'policy_reject' | 'device_revoke',
  targetHash: '0x...',           // tx: intentHash, policy: policyHash

  // 누가
  approver: '0x...',             // identity public key
  deviceId: 'device_abc',        // 서명한 디바이스

  // 맥락
  chain: 'ethereum',             // cross-chain replay 방지
  requestId: 'req_123',          // pending policy ID 또는 intent ID
  policyVersion: 3,              // tx 승인 시: 현재 policy 버전 바인딩

  // 언제까지
  expiresAt: 1720000000,
  nonce: 42,                     // per-approver + per-device 스코프

  // 서명
  sig: '0xdef...'                // Ed25519 sign(sig 제외한 모든 필드)
}
```

### 검증 로직 (WDK 내부, 우회 불가)

```
verifyApproval(signedApproval, trustedApprovers, store):
  1. approver ∈ trustedApprovers?
     → 미등록 시: UntrustedApproverError

  2. deviceId not revoked?
     → revoked 시: DeviceRevokedError

  3. Ed25519.verify(sig, canonicalHash(sig 제외 전체 필드), approver)?
     → 실패 시: SignatureError

  4. expiresAt > now?
     → 만료 시: ApprovalExpiredError

  5. nonce > lastNonce[approver][deviceId]?
     → 중복 시: ReplayError

  6. type별 추가 검증:
     - tx: targetHash === intent calldata hash? policyVersion === current?
     - policy: targetHash === SHA-256(canonicalJSON(policies))?
     - device_revoke: targetHash === SHA-256(deviceId)?

  → 전부 통과 시:
    - nonce 업데이트
    - type별 처리 (tx: Promise resolve, policy: countersign + 저장, device: revoke)
    - history 기록
    - 이벤트 emit
```

### SignedApprovalBroker (기존 InMemoryApprovalBroker 대체, breaking change)

```javascript
class SignedApprovalBroker {
  constructor(trustedApprovers, store)

  // 요청 생성 (WDK 내부 또는 AI가 CLI로 호출)
  createRequest(type, { chain, targetHash, requestId, metadata }): ApprovalRequest

  // 서명된 승인 제출 (daemon이 control channel에서 수신 후 호출)
  submitApproval(signedApproval): void
    → verifyApproval() 통과 시 내부 Promise resolve
    → 실패 시 에러 throw

  // 대기 (WDK 내부에서 REQUIRE_APPROVAL 시 호출)
  waitForApproval(requestId, timeoutMs): Promise<SignedApproval>

  // 영속 저장
  store: ApprovalStore
}
```

---

## Guarded WDK 확장 (Layer 1)

### 현재 상태 (✅ 완료)

소스: `/Users/mousebook/Documents/GitHub/wdk/src/guarded/` (5파일)

- contract level policy (target + selector + args)
- 3종 decision (AUTO / REQUIRE_APPROVAL / REJECT)
- 7종 이벤트
- 런타임 policy 교체 (immutable snapshot, in-memory)
- InMemoryApprovalBroker (→ 대체 예정)
- sign/signTypedData/keyPair/dispose 차단
- 43/43 테스트 통과

### 확장 (🔨 breaking change)

#### 1. Unified Signed Approval (위 섹션 참조)

기존 `InMemoryApprovalBroker` → `SignedApprovalBroker`로 완전 대체.
tx 승인 + policy 승인 + device 관리 = 하나의 검증 파이프라인.

#### 2. 영속 저장 + 로컬 DB

pluggable storage adapter (JSON 또는 SQLite).

```javascript
class ApprovalStore {
  // Active policy
  async loadPolicy(chain): Promise<SignedPolicy | null>
  async savePolicy(chain, signedPolicy): Promise<void>

  // Pending (policy 요청 + tx 승인 대기)
  async loadPending(type?, chain?): Promise<PendingRequest[]>
  async savePending(request): Promise<void>
  async removePending(requestId): Promise<void>

  // History (감사 추적)
  async appendHistory(entry): Promise<void>
  async getHistory(opts?: { type, chain, limit, offset }): Promise<HistoryEntry[]>

  // 디바이스
  async saveDevice(deviceId, publicKey): Promise<void>
  async getDevice(deviceId): Promise<Device | null>
  async revokeDevice(deviceId): Promise<void>

  // Nonce 추적
  async getLastNonce(approver, deviceId): Promise<number>
  async updateNonce(approver, deviceId, nonce): Promise<void>

  // Cron 관리
  async listCrons(): Promise<CronEntry[]>
  async saveCron(cron): Promise<CronEntry>
  async removeCron(cronId): Promise<void>
  async updateCronLastRun(cronId, timestamp): Promise<void>

  // Seed 관리 (다중 seed)
  async listSeeds(): Promise<SeedEntry[]>
  async getSeed(seedId): Promise<SeedEntry | null>
  async addSeed(name, mnemonic): Promise<SeedEntry>
  async removeSeed(seedId): Promise<void>
  async setActiveSeed(seedId): Promise<void>
  async getActiveSeed(): Promise<SeedEntry | null>
}

SeedEntry = {
  id: 'seed_abc',
  name: 'main-wallet',
  mnemonic: 'word1 word2 ...',   // 평문
  createdAt: 1710000000,
  isActive: true
}
```

**2가지 구현:**
- `JsonApprovalStore` — 파일 기반 (`~/.wdk/store/*.json`)
- `SqliteApprovalStore` — SQLite (`~/.wdk/store/wdk.db`)

#### 3. Tool Surface (agent/admin 분리)

**별도 CLI 프로세스 없음.** daemon이 WDK 라이브러리를 직접 호출하고, OpenClaw에 function calling tool로 노출.

**Agent surface** (OpenClaw tool로 등록 — AI가 호출 가능):
- `sendTransaction(chain, to, data, value)` — policy 평가 → 서명 → 제출
- `transfer(chain, token, to, amount)` — 토큰 전송
- `getBalance(chain)` — 잔고 조회
- `policyList(chain)` — active policy 조회
- `policyPending(chain)` — pending policy 조회
- `policyRequest(chain, reason, policies)` — policy 요청 생성
- `registerCron(interval, prompt, chain, sessionId)` — 주기 작업 등록
- `listCrons()` — 등록된 cron 조회
- `removeCron(cronId)` — cron 삭제

**Admin surface** (tool 등록하지 않음 — AI 접근 불가):
- `policyApprove(requestId, signedApproval)` — control channel에서 수신
- `deviceRevoke(deviceId, signedApproval)` — control channel에서 수신
- `journalList()`, `status()` — 로컬 관리용 CLI로 제공

**분리 enforcement**: daemon이 OpenClaw에 등록하는 tools 목록이 곧 보안 경계. admin 함수는 tool로 등록하지 않으므로 AI가 호출할 방법 자체가 없음.

**로컬 관리용 CLI** (선택): admin surface만 CLI로 제공. daemon에 로컬 소켓으로 접근.
```bash
$ wdk-admin status
$ wdk-admin journal list
$ wdk-admin device list
```

#### 5. 새 이벤트

기존 7종에 추가:

| 이벤트 | 발생 시점 |
|--------|---------|
| `PendingPolicyRequested` | AI가 policy 요청 생성 |
| `ApprovalVerified` | signed approval 검증 통과 (tx, policy 공통) |
| `ApprovalRejected` | signed approval 검증 실패 |
| `PolicyApplied` | policy countersign + 저장 + 런타임 반영 |
| `DeviceRevoked` | 디바이스 revoke |

#### 6. 파일 구조 (예상)

```
src/guarded/
  index.js                       -- 기존 + 새 export
  guarded-wdk-factory.js         -- 기존 + ApprovalStore, trustedApprovers
  guarded-middleware.js           -- 기존 (변경 최소)
  errors.js                      -- 확장 (SignatureError, ReplayError 등)
  signed-approval-broker.js      -- 🔨 신규: SignedApprovalBroker (broker 대체)
  approval-verifier.js           -- 🔨 신규: 통합 검증 로직
  approval-store.js              -- 🔨 신규: ApprovalStore 추상 인터페이스
  json-approval-store.js         -- 🔨 신규: JSON 파일 구현
  sqlite-approval-store.js       -- 🔨 신규: SQLite 구현

  approval-broker.js             -- ❌ 삭제 (SignedApprovalBroker로 대체)
```

**참고**: agent tool surface는 daemon 코드에서 구현 (WDK 라이브러리 호출 래핑). WDK 레포에 CLI 없음.

---

## Layer 2: Protocol Adapter

**Manifest = policy 생성용 카탈로그.** WDK가 직접 사용하지 않음. 사용자가 policy를 만들 때 참고.

DeFi 로직은 별도 CLI (aave-cli, uniswap-cli 등)가 담당. WDK는 tx를 받아서 policy 평가 → 서명할 뿐.

### manifest 규격

프로토콜이 "어떤 target + selector를 쓰는지" 선언:

```javascript
function getPolicyManifest(chainId) {
  return {
    protocol: 'aave-v3',
    version: '1.0.0',
    chains: { 1: { name: 'ethereum' }, 42161: { name: 'arbitrum' } },
    features: [
      {
        name: 'repay',
        description: 'Aave V3 부채 상환',
        calls: [{ target, selector, abi, args, value }],
        approvals: [{ token, spender, amount }],
        permits: [],
        suggestedDecision: 'AUTO',
        constraints: { maxSlippageBps: null, deadlineSeconds: null }
      }
    ]
  }
}
```

manifest → policy 변환은 DeFi CLI에서 (`--policy` 플래그). WDK 내부가 아님. RN App은 manifest를 모르고 policy JSON만 표시/승인.

**DeFi CLI `--policy` 패턴 (공식 policy 획득 흐름)**:
```
AI: aave-cli --policy → CLI가 필요한 policy JSON 출력
AI: policyRequest tool_call로 policy JSON을 WDK에 전달
owner: RN App에서 policy 승인/거부
```

---

## Layer 3: Daemon

**thin orchestration host. 핵심 신뢰 경계.**

```
daemon 프로세스 (privileged user)
├── Guarded WDK: 라이브러리 import (seed in-memory)
├── SignedApprovalBroker: 통합 승인 검증
├── Relay WS Client: outbound WebSocket
├── OpenClaw 관리: 메시지 전달, 라이프사이클
├── Cron Scheduler: 주기 작업 관리 (AI가 등록, daemon이 실행)
└── Execution Journal: intentId 기반 영속 dedupe
```

**daemon ↔ OpenClaw 통신**: OpenClaw는 OpenAI 호환 API (`http://localhost:18789`). daemon은 OpenAI SDK로 통신. 상세: `docs/openclaw-api-spec.md`

**OpenClaw 세션 매핑**: `user` 필드에 `userId:sessionId`를 합성. Relay의 chat_queue 세션 ID와 1:1 매핑. 한 유저의 여러 대화 세션이 OpenClaw 내부에서 분리됨.

**daemon이 등록하는 tools** (OpenAI function calling):
```javascript
tools: [
  // Agent surface — AI가 호출 가능
  { name: 'sendTransaction', parameters: { chain, to, data, value } },
  { name: 'transfer', parameters: { chain, token, to, amount } },
  { name: 'getBalance', parameters: { chain } },
  { name: 'policyList', parameters: { chain } },
  { name: 'policyPending', parameters: { chain } },
  { name: 'policyRequest', parameters: { chain, reason, policies } },
  // Cron 관리
  { name: 'registerCron', parameters: { interval, prompt, chain, sessionId } },
  { name: 'listCrons', parameters: {} },
  { name: 'removeCron', parameters: { cronId } },
]
// Admin surface (policyApprove, deviceRevoke 등)는 등록하지 않음
// → AI가 호출할 방법 자체가 없음
```

daemon이 하는 일:
1. session chat queue에서 메시지 수신 → OpenClaw API로 전달 (POST /v1/chat/completions)
2. control channel에서 SignedApproval 수신 → WDK에 전달 (검증은 WDK)
3. OpenClaw 응답 → Relay로 전송
4. Guarded WDK 이벤트 → Relay로 전송 (실시간 타임라인)
5. WDK countersign 유발 (검증 통과 시)
6. Cron 스케줄러: 등록된 주기 작업을 interval마다 OpenClaw에 자동 전송

daemon이 하지 않는 일:
- 서명 검증 (WDK가 함)
- policy 평가 (WDK가 함)
- AI 전략 결정 (OpenClaw가 함)
- DeFi tx 생성 (DeFi CLI가 함)

### Cron Scheduler

AI의 요청은 1회성이지만, "감시해줘" 같은 주기 작업이 필요함. OpenClaw 자체에는 cron 없음 → **daemon이 담당.**

```
사용자: "Aave health factor 5분마다 감시해줘"
  → OpenClaw: tool_call { name: 'registerCron', arguments: {
      interval: '5m',
      prompt: 'Check Aave health factor and repay if below 1.5',
      chain: 'ethereum',
      sessionId: 'session_abc'
    }}
  → daemon: cron 등록 (ApprovalStore에 영속 저장)
  → 매 5분마다: daemon이 OpenClaw에 prompt 자동 전송
  → OpenClaw가 tool_call로 상태 확인 → 필요시 sendTransaction
```

```javascript
CronEntry = {
  id: 'cron_abc',
  sessionId: 'session_abc',       // 어떤 세션에서 등록했는지
  interval: '5m',                 // 실행 주기
  prompt: 'Check Aave health...',  // OpenClaw에 보낼 메시지
  chain: 'ethereum',
  createdAt: 1710000000,
  lastRunAt: null,
  isActive: true
}
```

**owner 제어**: RN App에서 cron 목록 조회 + 중지/삭제 가능 (control channel).
**daemon 재시작**: ApprovalStore에서 cron 목록 복구 → 자동 재등록.

### Execution Journal

중복 온체인 실행 방지:
```
intentId → received → evaluated → approved → broadcasted → settled
```
재전송된 메시지의 intentId가 `broadcasted` 이상이면 무시.

---

## Layer 4: Control Plane (Relay Server)

**E2E 암호화로 payload 복호화 불가. 메시지 중계 + 상태 관리.**

### Control Queue Spec

```
Relay Server
  └─ user_123
       ├─ control_channel               ← user 스코프
       │   typed envelope:
       │   { type: 'tx_approval' | 'policy_approval' | 'policy_reject'
       │          | 'device_revoke' | 'policy_update' | 'status_sync',
       │     payload: SignedApproval | DeviceCommand | ...,
       │     messageId, timestamp }
       │
       └─ sessions/
            └─ session_abc
                 └─ chat_queue           ← session 스코프
                     일반 대화 메시지 (사용자 ↔ OpenClaw)
```

**control_channel** (user 스코프):
- 모든 SignedApproval이 여기로 (tx, policy, device ops)
- daemon이 즉시 소비
- 세션 없이도 동작 (device revoke, policy 직접 수정 등)

**chat_queue** (session 스코프):
- 사용자 ↔ OpenClaw 대화
- daemon이 polling → OpenClaw에 전달
- OpenClaw 응답 → daemon → Relay → RN App

### Redis 구현

| 용도 | Redis 자료구조 |
|------|---------------|
| chat_queue | Redis Streams (consumer group, XREAD BLOCK, XACK) |
| control_channel | Redis Streams (XREAD, 소비자 1개) |
| daemon 온라인 상태 | Key + TTL (`SET user:123:online EX 30` + heartbeat) |
| 세션 메타데이터 | Hash (`HSET session:abc ...`) |

추상화된 `QueueAdapter` 인터페이스 뒤에 — 나중에 교체 가능.

### 통신 엣지케이스

| 상황 | 대응 |
|------|------|
| WebSocket 끊김 | exponential backoff 재연결. 마지막 Stream ID → 누락분 재전송 |
| 메시지 유실 | Stream ID + XACK. ACK 안 오면 큐 보관 |
| 중복 실행 방지 | Execution Journal (intentId dedupe) |
| 메시지 순서 | Redis Stream ID (monotonic) |
| Relay 수평 확장 | Redis pub/sub + sticky session |
| Relay 장애 | daemon 독립 실행 가능. 복구 시 재연결 + 큐 동기화 |
| 오프라인 큐 | XTRIM으로 TTL (기본 24시간). 만료 시 앱에 알림 |
| Approval 타임아웃 | daemon 측 intent별 타임아웃 (60초). 만료 시 ExecutionFailed |

### E2E 암호화 + 기기 신뢰

| 항목 | 설계 |
|------|------|
| 키 교환 | 인증된 ECDH (SAS/QR). Relay MITM 시 SAS 불일치 |
| Identity Key | 앱: Ed25519 (Expo SecureStore). daemon: Ed25519. pairing 시 상호 등록 |
| Key Rotation | 주기적 세션 키 갱신. identity key 변경 시 re-pairing |
| 기기 Revocation | daemon이 소스 오브 트루스. revoke 시 세션 무효화 → Relay에 라우팅 정리 통보 |
| 암호화 범위 | payload 전체 E2E. Relay는 metadata(userId, messageId, timestamp)만 평문 |
| trustedApprovers | daemon 로컬이 소스 오브 트루스. Relay 레지스트리는 라우팅/푸시 전용 |

---

## Layer 5: Clients

### RN App

| 탭 | 기능 |
|----|------|
| **Chat** | OpenClaw와 대화 (자연어로 DeFi 요청) |
| **Policy** | active policy 조회, pending policy 승인/거부, manifest 기반 자동 생성 |
| **Approval** | tx 승인 대기 목록, 승인/거부 (SignedApproval 생성) |
| **Activity** | 이벤트 타임라인, 필터 |
| **Dashboard** | 잔고, DeFi 포지션 |
| **Settings** | pairing, 디바이스 관리, 알림 |

**Identity Key 저장**: Expo SecureStore (iOS Keychain / Android Keystore)

**통신**:
- Foreground: Relay와 WebSocket — 실시간
- Background: 푸시 알림 wake-up → WebSocket 재연결 → cursor 동기화
- identity key로 SignedApproval 생성 (tx + policy + device 공통)

### 로컬 관리 CLI (wdk-admin)

admin surface만 CLI로 제공. daemon에 로컬 소켓 접근.
```bash
$ wdk-admin status           # daemon 상태
$ wdk-admin journal list     # Execution Journal
$ wdk-admin device list      # paired 디바이스
```

agent surface는 CLI가 아닌 OpenClaw tool로만 노출.

---

## 보안 모델

### Unified Signed Approval

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ AI (OpenClaw)│     │ Guarded WDK  │     │ RN App      │
│ unprivileged │     │ (daemon 내)   │     │ (owner 폰)  │
│              │     │              │     │             │
│ tx/policy    │     │ seed 보유     │     │ identity key│
│ 요청 가능 ✅  │     │ countersign  │     │ (SecureStore)│
│              │     │ 검증 수행     │     │ 승인 발행 ✅ │
│ 서명 불가 ❌  │     │ 혼자 서명 ❌  │     │             │
│ seed 접근 ❌  │     │              │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

### 공격 방어

| 공격 | 방어 |
|------|------|
| AI가 policy/tx 자가 승인 | identity key가 폰 SecureStore에만 있음 |
| AI가 seed DB 직접 읽기 | Unix 파일 권한 (DB 파일 chmod 600 privileged only) |
| daemon이 혼자 policy 적용 | identity key 서명 없이 불가 |
| Relay가 승인 위조 | E2E 암호화 + identity key 서명 |
| 오래된 승인 replay | expiresAt + nonce (per-approver-per-device) |
| cross-chain replay | chain 필드가 서명에 포함 |
| policy 교체 후 stale tx approval | policyVersion 바인딩 |
| revoked 디바이스의 서명 | deviceId 검증 + daemon이 trust 소스 |
| daemon 재시작 후 상태 유실 | ApprovalStore 영속 저장 |

### 위협 모델 범위

| 범위 내 | 범위 밖 (Phase 2+) |
|---------|-------------------|
| AI의 tool 등록 경계 우회 시도 | AI의 OS 레벨 탈출 (컨테이너 격리) |
| Relay MITM | Relay 서버 자체 해킹 |
| 디바이스 분실 | 물리적 서버 접근 |
| replay 공격 | side-channel 공격 |

---

## 프로젝트 구조

### 모노레포 (workspaces)

```
WDK-APP/
  packages/
    guarded-wdk/ ← Layer 1 (서명 엔진, @tetherto/wdk 포크)
    manifest/    ← Layer 2 (policy 카탈로그, DeFi CLI용)
    daemon/      ← Layer 3 (orchestration host)
    relay/       ← Layer 4 (Relay Server + docker-compose)
    app/         ← Layer 5 (RN App, Expo)
  docs/
    PRD.md
    HANDOVER.md
    openclaw-api-spec.md   ← OpenClaw Gateway API 명세
  package.json   ← workspaces 설정
```

### Guarded WDK (모노레포 내 패키지)

```
WDK-APP/packages/guarded-wdk/
  src/guarded/
    index.js                       -- 기존 + 새 export
    guarded-wdk-factory.js         -- 기존 + ApprovalStore, trustedApprovers
    guarded-middleware.js           -- 기존 (변경 최소)
    errors.js                      -- 확장
    signed-approval-broker.js      -- 🔨 신규 (broker 대체)
    approval-verifier.js           -- 🔨 신규 (통합 검증)
    approval-store.js              -- 🔨 신규 (추상 인터페이스)
    json-approval-store.js         -- 🔨 신규
    sqlite-approval-store.js       -- 🔨 신규

    approval-broker.js             -- ❌ 삭제
```

---

## 기술 스택

| 구성 요소 | 기술 | 위치 |
|-----------|------|------|
| Guarded WDK | JS (ES Modules), 서명 엔진 | WDK-APP/packages/guarded-wdk |
| Agent Tools | daemon이 WDK 래핑, OpenAI function calling | WDK-APP/packages/daemon |
| Admin CLI | wdk-admin (로컬 소켓) | WDK-APP/packages/daemon |
| DeFi CLI | 별도 (프로토콜별 tx 생성) | 별도 레포/패키지 |
| Protocol Manifest | JSON 규격 + JS | WDK-APP/packages/manifest |
| Daemon | Node.js (orchestration host) | WDK-APP/packages/daemon |
| Relay Server | Node.js, Fastify, WebSocket | WDK-APP/packages/relay |
| Relay 저장소 | Redis Streams (큐) + PostgreSQL (레지스트리) | docker-compose |
| RN App | React Native, Expo, zustand | WDK-APP/packages/app |
| Identity Key 저장 | Expo SecureStore | RN App |
| Seed 저장 | ApprovalStore DB (다중 seed, 평문, chmod 600) | daemon 서버 |
| 푸시 알림 | Expo Notifications (wake-up) | Relay 경유 |
| E2E 암호화 | ECDH + Ed25519 | 앱 + daemon |
| AI Agent | OpenClaw (외부) | 개인 서버 (unprivileged) |

---

## 개발 순서

| # | 대상 | 산출물 | 상태 |
|---|------|--------|------|
| 1 | Guarded WDK 코어 | policy 평가 + 이벤트 (5파일) | ✅ 완료 |
| 2 | Guarded WDK 확장 | SignedApprovalBroker + ApprovalStore + CLI | 🔨 다음 |
| 3 | Protocol Adapter | manifest 규격 (policy 카탈로그) | 다음 |
| 4 | Daemon | orchestration host + Execution Journal | 다음 |
| 5 | Relay Server | chat queue + control channel + docker-compose | 다음 |
| 6 | RN App | SignedApproval UI + chat + dashboard + E2E pairing | 다음 |

---

## 아키텍처 결정사항

| 결정 | 선택 | 사유 |
|------|------|------|
| WDK 역할 | 서명 엔진. DeFi 로직은 별도 CLI | 관심사 분리 |
| 레이어 범위 | 5개 전부, 프로덕션 수준 | 시간 충분 |
| 프로젝트 구조 | 모노레포 + WDK 확장 | 런타임 분리 |
| daemon 역할 | thin orchestration host (핵심 신뢰 경계) | seed 보유, countersign |
| OS 격리 | DB 파일 chmod 600 privileged only | Unix 권한으로 seed 보호 |
| OpenClaw ↔ WDK | daemon이 tool 등록 (function calling), 별도 CLI 없음 | daemon이 직접 WDK 호출 |
| OpenClaw 세션 | user 필드에 userId:sessionId 합성 | Relay chat_queue와 1:1 매핑 |
| intentHash | SHA-256(canonical { chain, to, data, value }) | 키 정렬, lowercase |
| sessionKey | Phase 1에서 제거. identity key만으로 서명 | 단순화. Phase 2에서 추가 가능 |
| policyHash | sortKeysDeep + JSON.stringify, lowercase, decimal string | RN App과 WDK 동일 구현 |
| tool result | { status: executed/pending_approval/rejected/error, ... } | OpenClaw 분기 기준 |
| Phase 1 DeFi | AI가 raw calldata 직접 구성. DeFi helper tool 없음 | 단순, Phase 2에서 helper 추가 |
| 승인 시스템 | Unified SignedApproval (tx+policy+device 통합) | 하나의 검증 파이프라인 |
| Signed Envelope | approver+deviceId+chain+requestId+policyVersion+expiresAt+nonce | 결정론적 검증 |
| Nonce 스코프 | per-approver + per-device | 다중 디바이스 충돌 방지 |
| 기존 broker | breaking change — SignedApprovalBroker로 완전 대체 | 보안 통합 |
| Tool surface | agent (tool 등록) + admin (등록 안 함) 분리 | tool 등록 경계 = 보안 경계 |
| 큐 구조 | session chat queue + user control channel (typed envelope) | 스코프 분리 |
| Redis | Streams (추상화 뒤에) | cursor/ACK/TTL 내장 |
| Relay 저장소 | Redis + PostgreSQL + docker-compose | 역할별 분리 |
| Identity Key 저장 | Expo SecureStore | 보안 루트이므로 OS 수준 보호 |
| Seed 보관 | 다중 seed DB 관리 (평문, chmod 600) | CRUD + active seed 전환 |
| trustedApprovers | daemon 로컬이 소스 오브 트루스 | 검증 주체가 진실 보유 |
| Manifest | policy 생성용 카탈로그. WDK가 직접 사용 안 함 | WDK는 서명만 |
| 통신 | Relay 패턴, outbound WebSocket | NAT 통과 |
| E2E 암호화 | 인증된 ECDH + Ed25519 + SAS/QR | MITM 불가 |
| RN App 패턴 | HypurrQuant 차용 (상태머신, 어댑터, Zustand) | 검증된 패턴 |

---

## 비목표

- 자체 AI agent 개발 (OpenClaw 사용)
- 자체 DeFi 로직 (별도 CLI)
- 멀티 유저 / 팀 관리
- 온체인 policy
- seed 암호화 (Phase 1은 DB에 평문, Phase 2에서 WDK Secret Manager)
- 멀티체인 구현 (Phase 1은 EVM only, 설계는 멀티체인)
- AI의 OS 레벨 탈출 방어 (Phase 2 컨테이너 격리)

---

## 성공 기준

1. AI가 tool_call로 tx 전달 → daemon이 WDK로 서명/제출 (policy 범위 내)
2. AI가 policy 요청 → owner가 RN App에서 SignedApproval → 검증 → 적용
3. **AI는 policy/tx를 승인할 수 없음** (identity key 분리 + Unix 권한 격리 증명)
4. **tx 승인과 policy 승인이 동일한 Unified SignedApproval로 동작**
5. RN App에서 실시간 이벤트 + 대시보드
6. Execution Journal로 중복 온체인 실행 0건
7. E2E 암호화 — Relay가 payload 복호화 불가
8. daemon 재시작 후 signed policy + approval history 복구
9. control channel로 device revoke → 즉시 해당 디바이스 서명 거부
