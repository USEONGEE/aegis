# 설계 - v0.1.4 타입 시스템 리팩토링

## 변경 규모

**규모**: 일반 기능
**근거**:
- 6개 패키지 전체 수정 (2개+ 컴포넌트)
- 내부 API/인터페이스 전면 변경
- DB 스키마 변경 (SQLite 테이블 재생성, JSON 키 포맷 변경)
- 신규 모듈 추가 (daemon/message-queue.ts)
- 프로덕션 데이터 없음 → 운영 리스크 아님 (저장 포맷 reset 허용)

---

## 문제 요약

v0.1.0~v0.1.3에서 빠르게 구현하며 쌓인 타입 설계 부채 8가지를 해결한다. 5가지 리팩토링(camelCase 통일, PendingRequest 분리, chainId 통일, countersig 제거, permissions 딕셔너리)과 3가지 신규 기능(FIFO queue, pending 취소, signTransaction 분리).

> 상세: [README.md](README.md) 참조

---

## 실행 순서 및 의존성

```
8 (permissions dict)
  └→ 5 (chainId: number)
       └→ 1 (camelCase 통일)
            └→ 7 (countersig 제거)
                 └→ 3 (PendingRequest 분리)
                      ├→ 2 (FIFO queue)
                      │    └→ 4 (pending 취소)
                      └→ 6 (signTransaction 분리)
```

**순서: 8 → 5 → 1 → 7 → 3 → 2 → 4 → 6**

| 순서 | 이유 |
|------|------|
| 8 먼저 | permissions 구조 변경이 가장 근본적. evaluatePolicy + manifest + 테스트 전면 수정. 이후 변경이 같은 파일을 중복 수정하지 않도록 |
| 5 다음 | chainId 키 형식이 8에서 도입한 PermissionDict 키에 반영됨. ChainPolicies 키도 변경 |
| 1 다음 | 5에서 수정된 인터페이스의 camelCase 정리. 한 번만 수정 |
| 7 다음 | 1 완료 후 인터페이스 안정화 상태에서 단순 삭제 |
| 3 다음 | 안정화된 인터페이스 위에 새 타입 도입 |
| 2 다음 | PendingMessageRequest 타입 사용하는 FIFO queue |
| 4 다음 | 2의 queue 위에 취소 기능 추가 |
| 6 마지막 | 독립적이지만 앞선 정리 혜택 |

---

## 접근법

1. **Bottom-up 순서**: 가장 기초적인 타입 구조(permissions dict)부터 변경하고 상위 레이어로 진행
2. **Step별 테스트 통과**: 각 변경 후 `npm test` 통과 확인 (242개 → 수정/추가)
3. **저장 포맷 reset**: DB 스키마 변경 시 기존 파일 삭제 후 재생성 (마이그레이션 불필요)
4. **단일 변환 지점**: chain string→number 변환은 daemon tool-surface 경계에서만 수행. app, manifest, canonical, guarded-wdk 모두 `chainId: number` 직접 사용

---

## 대안 검토

### permissions 구조

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Permission[] 유지 (현행) | 변경 없음 | O(n) 매칭, 구조적 개선 없음 | ❌ |
| B: `Map<string, Map<string, Rule[]>>` | 타입 안전 | JSON 직렬화 복잡, 저장/로드 시 변환 필요 | ❌ |
| C: 중첩 plain object `{target: {selector: Rule[]}}` | O(1) lookup, JSON 직렬화 자연스러움, 저장 그대로 | 키 누락 시 undefined 처리 필요 | ✅ |

**선택 이유**: C가 JSON 기반 저장소(JsonApprovalStore)와 자연스럽게 호환. Permission set 크기가 작아 Map 오버헤드 불필요.

### FIFO queue 구현

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Redis Streams | 재시작 시 메시지 유지, 수평 확장 가능 | 운영 복잡도 증가, daemon은 단일 프로세스 | ❌ |
| B: In-memory array + consumer | 단순, 외부 의존 없음, 세션 친화적 | 재시작 시 메시지 소실 | ✅ |

**선택 이유**: daemon은 단일 프로세스이고 세션 친화적. 재시작 시 cron은 재생성되고 user 메시지는 어차피 실패. Redis는 수평 확장 필요 시 후속 Phase에서 도입.

### chainId 상수 위치

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: canonical 패키지에 CHAIN_IDS 상수 | 리프 패키지, 모든 패키지가 의존 가능 | canonical의 역할 확장 | ✅ |
| B: 별도 @wdk-app/chains 패키지 | 관심사 분리 | 패키지 추가 오버헤드 | ❌ |
| C: 각 패키지에서 직접 정의 | 패키지 독립성 | 중복, 불일치 위험 | ❌ |

**선택 이유**: canonical은 이미 모든 패키지의 리프 의존성. CHAIN_IDS 상수 추가는 자연스러운 확장.

---

## 기술 결정

1. **PermissionDict 키 형식**: lowercase address (`0x1234...`) 또는 wildcard `*`. Selector도 동일 규칙.
2. **PermissionDict 순서 보존**: `Rule.order` 필드로 원본 배열 인덱스 보존. 후보 수집 → order 정렬 → 첫 매칭. 기존 순차 매칭 의미론 100% 유지.
3. **chainId 타입**: `number` (EVM 표준). `CHAIN_IDS` 상수는 `as const satisfies Record<string, number>`.
4. **chainId 변환 경계**: daemon tool-surface에서 1회만 string→number 변환. 나머지 모든 내부 인터페이스는 `chainId: number` 직접 사용 (app, manifest, canonical 포함).
5. **camelCase 변환 위치**: Store 구현체 내부. Abstract `ApprovalStore` 메서드는 camelCase 타입만 사용.
6. **Stored* 타입**: Store 구현체 private. 외부 노출하지 않음.
7. **FIFO queue**: In-memory, session별 독립. `AbortController`로 취소 지원.
8. **signTransaction 호출 경로**: OpenClaw → daemon tool-surface → WDKInstance → GuardedAccount.signTransaction → journal. rawAccount.signTransaction 미지원 시 rawAccount.sign(serializeTx) 대체.
9. **pending cancel 계약**: control channel message type `cancel_message` / `cancel_message_result`. 처리 중 취소 시 AbortController.abort().

---

## 범위 / 비범위

**범위(In Scope)**:
- 8가지 변경 전체 (리팩토링 5 + 신규 3)
- 기존 테스트 수정 및 신규 테스트 추가
- CI 체크 7개 PASS 유지
- type-dep-graph 재생성

**비범위(Out of Scope)**:
- Gap 분석 중 위 8개에 해당하지 않는 Gap
- E2E pairing, approval context 등 (별도 Phase)
- Redis 기반 queue (v0.1.4에서는 in-memory)
- RN App UI 변경 (pending 취소 버튼 등은 최소한의 control message 전송만)

---

## 아키텍처 개요

### 변경 전
```
manifest → Permission[] → CallPolicy.permissions (배열)
                              ↓
                         evaluatePolicy: O(n) 순차 스캔
                              ↓
ChainPolicies: Record<string, ...>  (chain string 키)
                              ↓
SignedApproval.chain: string
PendingRequest: 단일 타입 (snake_case 혼재)
daemon: fire-and-forget processChat()
```

### 변경 후
```
manifest → PermissionDict → CallPolicy.permissions (딕셔너리)
                              ↓
                         evaluatePolicy: O(1) target+selector → O(m) rules
                              ↓
ChainPolicies: Record<number, ...>  (chainId number 키)
                              ↓
SignedApproval.chainId: number
PendingApprovalRequest / PendingMessageRequest: 분리 타입 (camelCase)
daemon: SessionMessageQueue → 직렬 처리
```

---

## API/인터페이스 계약

### Change 8: permissions 딕셔너리

```typescript
// Before
interface Permission {
  target?: string
  selector?: string
  args?: Record<string, ArgCondition>
  valueLimit?: string | number
  decision: Decision
}

interface CallPolicy {
  type: 'call'
  permissions: Permission[]  // O(n)
}

// After
interface Rule {
  args?: Record<string, ArgCondition>
  valueLimit?: string | number
  decision: Decision
}

interface PermissionDict {
  [target: string]: {           // lowercase address or '*'
    [selector: string]: Rule[]  // 4-byte hex or '*'
  }
}

interface CallPolicy {
  type: 'call'
  permissions: PermissionDict  // O(1) lookup
}
```

**Lookup 알고리즘** (evaluatePolicy) — **기존 순서 의미론 보존**:

현재 Permission[]은 순차 순회하여 첫 매칭을 반환한다. 딕셔너리 전환 시 이 의미론이 바뀌면 안 된다(PRD: "동작 변경 없는 리팩토링").

각 Rule에 `order: number` 필드를 추가하여 원본 배열의 순서를 보존한다:

```typescript
interface Rule {
  order: number                    // 원본 Permission[] 내 인덱스
  args?: Record<string, ArgCondition>
  valueLimit?: string | number
  decision: Decision
}
```

Lookup 절차:
```
1. candidates: Rule[] = []
2. exact_target = permissions[txTo]
3. wild_target = permissions['*']
4. 각 bucket (exact_target, wild_target)에서:
   a. exact_selector = bucket?.[txSelector] → candidates에 추가
   b. wild_selector = bucket?.['*'] → candidates에 추가
5. candidates를 order 기준으로 정렬 (오름차순)
6. 정렬된 순서대로 args, valueLimit 체크
7. 첫 매칭 Rule의 decision 반환
```

이 방식은 O(1) target+selector lookup의 이점을 유지하면서, 같은 dict에 wildcard와 specific rule이 혼재해도 원본 배열 순서대로 평가한다. 현재 코드베이스의 manifest-to-policy는 specific call 먼저, wildcard approve 나중에 생성하므로 기존 동작과 100% 동일하다.

**변환 함수** (Permission[] → PermissionDict):
```typescript
function permissionsToDict(permissions: Permission[]): PermissionDict {
  const dict: PermissionDict = {}
  permissions.forEach((perm, i) => {
    const target = perm.target?.toLowerCase() ?? '*'
    const selector = perm.selector ?? '*'
    dict[target] ??= {}
    dict[target][selector] ??= []
    dict[target][selector].push({
      order: i,
      args: perm.args,
      valueLimit: perm.valueLimit,
      decision: perm.decision,
    })
  })
  return dict
}
```

### Change 5: chainId

```typescript
// canonical/src/index.ts
export const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  sepolia: 11155111,
  polygon: 137,
} as const satisfies Record<string, number>

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS]

// intentHash 변경
// Before: { chain: string|number, to, data, value }
// After:  { chainId: number, to, data, value }
```

| 인터페이스 | Before | After |
|-----------|--------|-------|
| `SignedApproval` | `chain: string` | `chainId: number` |
| `ApprovalRequest` | `chain: string` | `chainId: number` |
| `ChainPolicies` | `Record<string, ChainPolicyConfig>` | `Record<number, ChainPolicyConfig>` |
| `IntentInput` | `chain: string \| number` | `chainId: number` |
| `MiddlewareConfig` | `chain: string` | `chainId: number` |
| `Manifest.chains` | `Record<string, ChainConfig>` | `Record<number, ChainConfig>` |
| `CronInput` | `chain?: string` | `chainId?: number` |

**chainId 전환 경계 맵** (모든 string→number 전환 지점):

| 경계 | 변환 방향 | 설명 |
|------|----------|------|
| **daemon tool-surface** | `string → number` | OpenClaw가 `chain: "ethereum"` 전달 → `CHAIN_IDS[args.chain]`으로 변환. **유일한 string→number 변환 지점** |
| **manifest 정의** | 직접 `number` | Manifest.chains 키가 `Record<number, ChainConfig>`으로 변경. manifest 작성 시 `{ 1: {...}, 42161: {...} }` 형식. manifestToPolicy(manifest, chainId: number) |
| **app SignedApprovalBuilder** | 직접 `number` | `packages/app/src/core/approval/SignedApprovalBuilder.ts`에서 `chainId: number` 직접 사용. App은 relay를 통해 daemon으로부터 `chainId: number`를 수신 |
| **app approval types** | 직접 `number` | `packages/app/src/core/approval/types.ts`의 ApprovalRequest, SignedApproval 등 모두 `chainId: number` |
| **relay** | 투명 전달 | relay는 payload를 그대로 전달 (serialize/deserialize만). chain 필드를 해석하지 않음 |
| **canonical intentHash** | 직접 `number` | `intentHash({ chainId: number, ... })`. 정규화 JSON 키가 `chain` → `chainId`로 변경 |
| **guarded-wdk 전체** | 직접 `number` | SignedApproval, ApprovalRequest, ChainPolicies, evaluatePolicy 등 모두 `chainId: number` |

**원칙**: daemon tool-surface 이외에는 string→number 변환이 없다. 모든 내부 인터페이스는 `chainId: number`만 사용한다.

**unknown chain 에러 계약**: daemon tool-surface에서 `CHAIN_IDS[args.chain]`이 undefined면 즉시 에러 반환:
```typescript
const chainId = CHAIN_IDS[args.chain as keyof typeof CHAIN_IDS]
if (chainId === undefined) {
  return { status: 'error', error: `Unknown chain: ${args.chain}. Supported: ${Object.keys(CHAIN_IDS).join(', ')}` }
}
```
이 에러는 OpenClaw에 tool 결과로 반환되어, AI가 유효한 chain을 재시도하거나 사용자에게 안내할 수 있다.

### Change 1: camelCase 통일

```typescript
// Before (이중 네이밍)
interface HistoryEntry {
  seedId?: string; seed_id?: string
  targetHash?: string; target_hash?: string
  // ...
}

// After (camelCase only)
interface HistoryEntry {
  seedId: string
  type: string
  chainId: number | null
  targetHash: string
  approver: string
  deviceId: string
  action: string
  signedApproval?: SignedApproval
  timestamp: number
}
```

`Stored*` 타입(StoredHistoryEntry, StoredJournalEntry, CronRecord)은 Store 구현체 내부로 이동. 외부 API에서 제거.

### Change 3: PendingRequest 분리

```typescript
// Before
interface PendingRequest {
  request_id: string; seed_id: string; type: string
  chain: string; target_hash: string
  metadata_json: string | null; created_at: number
}

// After
interface PendingApprovalRequest {
  requestId: string
  seedId: string
  type: ApprovalType  // 'tx' | 'policy'
  chainId: number
  targetHash: string
  metadata?: Record<string, unknown>
  createdAt: number
}

interface PendingMessageRequest {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
}
```

ApprovalStore 메서드:
```typescript
// Before
loadPending(seedId, type, chain): Promise<PendingRequest[]>
savePending(seedId, request): Promise<void>
removePending(requestId): Promise<void>

// After
loadPendingApprovals(seedId, type, chainId): Promise<PendingApprovalRequest[]>
savePendingApproval(seedId, request): Promise<void>
removePendingApproval(requestId): Promise<void>
```

### Change 2: FIFO queue

```typescript
// packages/daemon/src/message-queue.ts

interface QueuedMessage {
  messageId: string
  sessionId: string
  source: 'user' | 'cron'
  userId: string
  text: string
  chainId?: number
  createdAt: number
  cronId?: string
  abortController: AbortController
}

type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<void>

interface CancelResult {
  ok: boolean
  reason?: 'not_found' | 'already_completed'
  wasProcessing?: boolean        // true면 AbortController로 중단됨
}

class SessionMessageQueue {
  enqueue(msg): string           // returns messageId
  cancel(messageId): CancelResult // cancel pending or abort current
  listPending(): PendingMessageRequest[]
  get pendingCount(): number
  dispose(): void
}

class MessageQueueManager {
  getQueue(sessionId): SessionMessageQueue
  enqueue(sessionId, msg): string
  cancel(messageId): CancelResult
  dispose(): void
}
```

### Change 4: pending 취소 — 외부 메시지 계약

**enqueue 시 ack 메시지** (daemon → app via relay control channel):
```typescript
// daemon이 메시지를 큐에 넣은 후 app에 알림
{
  type: 'message_queued',
  messageId: string,        // 취소 시 사용할 ID
  sessionId: string,
  source: 'user' | 'cron',
  position: number           // 큐 내 위치 (0 = 현재 처리중)
}
```

**cancel 요청** (app → daemon via relay control channel):
```typescript
// app이 취소 요청
{
  type: 'cancel_message',
  messageId: string
}
```

**cancel 응답** (daemon → app via relay control channel):
```typescript
// 취소 성공
{
  type: 'cancel_message_result',
  messageId: string,
  ok: true,
  wasProcessing: boolean     // true면 AbortController로 중단됨
}

// 취소 실패 (이미 완료 또는 messageId 없음)
{
  type: 'cancel_message_result',
  messageId: string,
  ok: false,
  reason: 'not_found' | 'already_completed'
}
```

**처리 중 취소 시 최종 상태**:
- 큐 대기중이면: 큐에서 제거. processChat 호출 안 됨.
- 처리 중이면: `AbortController.abort()` → processChat 내부에서 `signal.aborted` 체크 → `AbortError` throw → 해당 메시지는 `cancelled` 상태로 완료. 이미 실행된 tool call은 되돌리지 않음 (멱등하지 않은 연산의 경우 부분 실행 상태 가능).
- 이미 완료됨: 취소 불가. `ok: false, reason: 'already_completed'` 반환.

**daemon control-handler.ts 추가**:
```typescript
case 'cancel_message': {
  const { messageId } = payload
  const result = queueManager.cancel(messageId)  // CancelResult
  relayClient.send('control', {
    type: 'cancel_message_result',
    messageId,
    ...result   // { ok, reason?, wasProcessing? }
  })
  break
}
```

### Change 6: signTransaction — 전체 호출 경로

```
OpenClaw → daemon tool-surface (signTransaction 도구)
               ↓
          WDKInstance.signTransaction(chainId, tx)
               ↓
          GuardedAccount.signTransaction(tx)
               ↓
          1. evaluatePolicy (기존 로직 재사용)
          2. REQUIRE_APPROVAL → approval flow (기존 로직)
          3. rawAccount.signTransaction(tx) → signedTx
          4. journal.updateStatus(intentId, 'signed')
               ↓
          return { signedTx, intentHash, requestId }
```

**daemon tool-surface 도구 정의**:
```typescript
// packages/daemon/src/tool-surface.ts — 신규 도구 추가
{
  type: 'function',
  function: {
    name: 'signTransaction',
    description: 'Sign a transaction without broadcasting. Returns the signed transaction hex.',
    parameters: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Chain name (e.g., "ethereum")' },
        to: { type: 'string', description: 'Destination address' },
        data: { type: 'string', description: 'Calldata hex string' },
        value: { type: 'string', description: 'Value in wei', default: '0' }
      },
      required: ['chain', 'to', 'data']
    }
  }
}

// executeToolCall 내 signTransaction 처리:
case 'signTransaction': {
  const chainId = CHAIN_IDS[args.chain]
  const { to, data, value } = args
  const hash = intentHash({ chainId, to, data, value })

  if (journal?.isDuplicate(hash)) return { status: 'duplicate' }

  const result = await wdkInstance.signTransaction(chainId, { to, data, value })
  // result: { signedTx, intentHash, requestId }

  journal?.updateStatus(result.intentId, 'signed')
  return { status: 'signed', signedTx: result.signedTx, intentHash: hash }
}
```

**WDKInstance 확장** (`packages/daemon/src/wdk-host.ts`):
```typescript
// 기존: WDKInstance.getAccount(chainId) → GuardedAccount (sendTransaction만 있음)
// 추가: WDKInstance.signTransaction(chainId, tx) → SignTransactionResult

class WDKInstance {
  async signTransaction(chainId: number, tx: Transaction): Promise<SignTransactionResult> {
    const account = await this.getAccount(chainId)
    return account.signTransaction(tx)
  }
}
```

**GuardedAccount 추가** (`packages/guarded-wdk/src/guarded-middleware.ts`):
```typescript
interface SignTransactionResult {
  signedTx: string      // serialized signed tx (hex)
  intentHash: string    // canonical hash
  requestId: string     // approval tracking
  intentId: string      // journal tracking
}

// guarded-middleware에서 account에 signTransaction 메서드 추가
account.signTransaction = async (tx: Transaction): Promise<SignTransactionResult> => {
  // 1. evaluatePolicy (sendTransaction과 동일)
  // 2. REQUIRE_APPROVAL → approval flow (sendTransaction과 동일)
  // 3. rawAccount.signTransaction(tx) → signedTx (서명만, 전송 안함)
  //    - rawAccount에 signTransaction이 없으면: rawAccount.sign(serializeTx(tx))로 대체
  // 4. emit 'TransactionSigned' event
  // 5. return { signedTx, intentHash, requestId, intentId }
}

// 기존 sign 차단은 유지 (임의 메시지 서명 방지)
account.sign = () => { throw new ForbiddenError('sign') }
```

Journal 상태 확장: `received → evaluated → approved → signed → broadcasted → settled | failed`

**WDK 하위 호환성 주의**: `rawAccount.signTransaction()`이 `@tetherto/wdk`에 존재하지 않을 수 있다. 이 경우 `rawAccount.sign(serializeTransaction(tx))`로 대체하거나, WDK 소스를 확인하여 적절한 저수준 API를 사용한다. mock 환경에서는 동작 보장.

---

## 데이터 모델/스키마

### SQLite 변경 (저장 포맷 reset)

**policies 테이블**:
```sql
-- Before
chain TEXT NOT NULL
wdk_countersig TEXT NOT NULL DEFAULT ''

-- After
chain_id INTEGER NOT NULL        -- string → number
-- wdk_countersig 삭제
```

**pending_requests 테이블**:
```sql
-- Before
chain TEXT NOT NULL

-- After (renamed to pending_approvals)
chain_id INTEGER NOT NULL
```

**approval_history 테이블**:
```sql
-- Before
chain TEXT

-- After
chain_id INTEGER
```

**crons 테이블**:
```sql
-- Before
chain TEXT

-- After
chain_id INTEGER
```

**execution_journal 테이블**:
```sql
-- Before
chain TEXT NOT NULL
-- status: received, evaluated, approved, broadcasted, settled, failed

-- After
chain_id INTEGER NOT NULL
-- status: + 'signed' 추가
```

### JSON Store 변경

키 포맷: `${seedId}:ethereum` → `${seedId}:1`

---

## 테스트 전략

### 리팩토링 항목 (1, 3, 5, 7, 8)

**원칙**: 동작 변경 없이 구조만 변경. 기존 테스트의 입력/기대값을 새 타입에 맞게 수정.

| 변경 | 수정할 테스트 | 내용 |
|------|------------|------|
| 8 | evaluate-policy.test.ts, manifest-to-policy.test.ts | Permission[] → PermissionDict 구성 방식 변경 |
| 5 | 거의 전체 | `chain: 'ethereum'` → `chainId: 1` |
| 1 | json/sqlite-approval-store.test.ts | 입력을 camelCase로 통일, 반환값도 camelCase 확인 |
| 7 | sqlite-approval-store.test.ts | wdk_countersig 관련 assertion 제거 |
| 3 | approval-broker.test.ts | PendingRequest → PendingApprovalRequest 타입 변경 |

### 신규 기능 항목 (2, 4, 6)

| 변경 | 새 테스트 | 내용 |
|------|---------|------|
| 2 | message-queue.test.ts | 직렬 처리 확인, 동시 enqueue 시 순서 보장, queue full 에러 |
| 4 | message-queue.test.ts (추가) | pending 취소 확인, 처리 중 취소 시 abort 확인 |
| 6 | integration.test.ts (추가) | signTransaction → signedTx 반환 확인, journal "signed" 상태 확인 |

### 공통
- 각 변경 후 `npm test` 전체 통과 확인
- 각 변경 후 `npx tsx scripts/check/index.ts` CI 체크 7개 PASS 확인

---

## 가정/제약

- Phase 1 데이터가 프로덕션에 없으므로 저장 포맷 reset 허용
- breaking change 허용 (내부 인터페이스)
- daemon은 단일 프로세스 (수평 확장 불필요)
- `@tetherto/wdk`의 signTransaction 지원 여부 확인 필요 (Change 6)
- intentHash 출력이 변경됨 (`chain` → `chainId` 키) — 기존 해시와 비호환 (허용)

---

## 실패/에러 처리

N/A: 리팩토링 항목은 기존 에러 처리 유지. FIFO queue는 processTimeout으로 무한 대기 방지. signTransaction은 sendTransaction과 동일한 에러 패턴 사용.

## 성능/스케일

N/A: permissions dict O(1) lookup이 유일한 성능 변경. 현재 permission 수가 적어 (Aave V3: 6개) 체감 차이 없음. 향후 대규모 policy 시 유의미.

## 롤아웃/롤백 계획

N/A: 프로덕션 배포 없음. 저장 포맷 reset 허용.

## 관측성

N/A: 로그/메트릭 변경 없음.

## 보안/권한

N/A: 서명 검증 로직 변경 없음. signTransaction은 기존 policy 평가 + 승인 검증 동일 적용.

---

## 리스크/오픈 이슈

| 리스크 | 심각도 | 완화 방법 |
|--------|--------|---------|
| Change 5 hash breakage | 낮음 | 저장 포맷 reset 허용됨 |
| Change 8+5 double-touch | 중간 | 8 먼저 완료 → 5에서 키 타입만 변경 |
| Change 8 매칭 의미론 변경 | 낮음 | Rule.order 필드로 원본 배열 순서 보존. 후보 수집 후 order 정렬하여 기존 순차 매칭과 동일 결과 보장 |
| Change 6 WDK signTransaction 미지원 | 중간 | mock 환경에서는 동작. rawAccount.sign(serializeTx)로 대체 가능. 실제 WDK 연동 시 확인 필요 |
| Change 4 처리 중 취소 시 부분 실행 | 낮음 | 이미 실행된 tool call은 되돌리지 않음. 멱등하지 않은 연산의 부분 실행은 known limitation으로 문서화 |
| Change 2 메시지 소실 (재시작) | 낮음 | cron 재생성, user 메시지 실패 가시적. Redis 후속 Phase |
| 테스트 대량 수정 (8+5) | 중간 | 순차 실행, 각 step 후 npm test 확인 |
