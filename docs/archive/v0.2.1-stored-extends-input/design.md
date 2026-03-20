# 설계 - v0.2.1

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 컴포넌트(guarded-wdk, daemon) 수정, 내부 API(StoredPolicy 인터페이스) 변경. 데이터 포맷 변경 없음(내부 저장 형식 유지).

---

## 문제 요약

Input/Stored 타입 쌍 3개에서 필드가 중복 복사되어 있고, StoredPolicy는 직렬화된 형태(policiesJson: string)를 도메인 인터페이스에 노출하여 소비자마다 JSON.parse()를 반복 호출해야 한다.

> 상세: [README.md](README.md) 참조

## 접근법

**핵심 전략**: Stored 타입을 대응하는 Input 타입에서 extends하고, 메타데이터 필드만 추가 선언한다.

1. `StoredCron extends CronInput` -- 4개 중복 필드 제거, 5개 메타 필드만 남김
2. `StoredJournal extends JournalInput` -- 5개 중복 필드 제거, 3개 메타 필드만 남김
3. `StoredPolicy extends PolicyInput` -- policiesJson/signatureJson 제거, policies/signature 상속. store 구현이 read 시 parse, write 시 stringify 담당

기존 패턴 참조: `PendingApprovalRequest extends ApprovalRequest` (approval-store.ts:67)

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: interface extends | 타입 관계 명시, 중복 제거, TS 표준 패턴 | 직렬화 형태 변경(policiesJson->policies)으로 소비자 수정 필요 | ✅ |
| B: type intersection (Input & { meta }) | extends와 동일한 효과 | interface가 아닌 type alias라 에러 메시지가 덜 명확, 프로젝트에서 interface 사용 관례 | ❌ |
| C: 현상 유지 + lint rule | 코드 변경 없음 | 근본 원인 미해결, 직렬화 노출 계속 | ❌ |

**선택 이유**: A. 프로젝트에 이미 `PendingApprovalRequest extends ApprovalRequest` 패턴이 존재하고, interface extends가 가장 명시적이다.

## 기술 결정

| 결정 | 내용 | 근거 |
|------|------|------|
| 상속 방향 | Stored extends Input | Input이 최소 정보, Stored = Input + 메타데이터 |
| PolicyInput 필드 이름 보존 | policies, signature (기존 PolicyInput과 동일) | 소비자가 stored.policies로 직접 접근, JSON.parse 불필요 |
| store 내부 parse/stringify | loadPolicy에서 JSON.parse, savePolicy에서 JSON.stringify | 직렬화 전략이 store 구현 내부로 캡슐화됨 |
| store-types.ts PolicyRow 유지 | policies_json/signature_json TEXT 컬럼 그대로 | 내부 저장 형식 변경 없음, public 인터페이스만 변경 |

---

## 범위 / 비범위

- **범위(In Scope)**: guarded-wdk 타입 정의 + store 구현 2개 + guarded-wdk-factory.ts + daemon(wdk-host.ts, tool-surface.ts) + 관련 테스트 5개
- **비범위(Out of Scope)**: app 패키지 (policiesJson 소비 없음), relay 패키지 (무관), store-types.ts @internal row 타입, StoredHistoryEntry/StoredJournalEntry

## 아키텍처 개요

변경 전후 계층:
```
변경 전: PolicyInput (L0) ← ApprovalStore (L3) → StoredPolicy (L0, 독립 leaf)
변경 후: PolicyInput (L0) ← StoredPolicy (L1, extends) ← ApprovalStore (L3)
```

StoredCron, StoredJournal도 동일한 구조 변경. Input이 leaf로 남고, Stored가 L0 → L1로 승격.

## API/인터페이스 계약

| 변경 전 | 변경 후 | 영향 |
|---------|---------|------|
| `StoredPolicy.policiesJson: string` | `StoredPolicy.policies: unknown[]` (PolicyInput 상속) | 모든 소비자에서 JSON.parse() 제거 |
| `StoredPolicy.signatureJson: string` | `StoredPolicy.signature: Record<string, unknown>` (PolicyInput 상속) | 동일 |
| `StoredCron` (독립 interface) | `StoredCron extends CronInput` | shape 동일, 소비자 변경 없음 |
| `StoredJournal` (독립 interface) | `StoredJournal extends JournalInput` | shape 동일, 소비자 변경 없음 |

## 데이터 모델/스키마

N/A: 내부 저장 형식(SQLite 컬럼 `policies_json TEXT`, JSON 파일 키 `policies_json`) 변경 없음. store-types.ts의 PolicyRow도 변경 없음.

## 가정/제약

N/A: 외부 의존 없음, 일정/법/보안 제약 없음.

---

## Step-by-step 구현 계획

### Step 1: 타입 정의 변경 (approval-store.ts)

**파일**: `packages/guarded-wdk/src/approval-store.ts`
**위험도**: Medium -- 모든 다운스트림에 영향

#### 1a. StoredCron extends CronInput

현재:
```ts
export interface StoredCron {
  id: string
  accountIndex: number
  sessionId: string        // CronInput과 중복
  interval: string         // CronInput과 중복
  prompt: string           // CronInput과 중복
  chainId: number | null   // CronInput과 중복
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}
```

변경 후:
```ts
export interface StoredCron extends CronInput {
  id: string
  accountIndex: number
  createdAt: number
  lastRunAt: number | null
  isActive: boolean
}
```

**제거되는 필드**: sessionId, interval, prompt, chainId (CronInput에서 상속)
**추가되는 필드**: 없음 (기존 메타 필드만 남음)
**타입 호환성**: StoredCron의 shape이 완전히 동일하므로 소비자 코드 변경 불필요

#### 1b. StoredJournal extends JournalInput

현재:
```ts
export interface StoredJournal {
  intentHash: string       // JournalInput과 중복
  accountIndex: number     // JournalInput과 중복
  chainId: number          // JournalInput과 중복
  targetHash: string       // JournalInput과 중복
  status: JournalStatus    // JournalInput과 중복
  txHash: string | null
  createdAt: number
  updatedAt: number
}
```

변경 후:
```ts
export interface StoredJournal extends JournalInput {
  txHash: string | null
  createdAt: number
  updatedAt: number
}
```

**제거되는 필드**: intentHash, accountIndex, chainId, targetHash, status (JournalInput에서 상속)
**타입 호환성**: StoredJournal의 shape이 완전히 동일하므로 소비자 코드 변경 불필요

#### 1c. StoredPolicy extends PolicyInput

현재:
```ts
export interface PolicyInput {
  policies: unknown[]
  signature: Record<string, unknown>
}

export interface StoredPolicy {
  accountIndex: number
  chainId: number
  policiesJson: string        // PolicyInput.policies의 직렬화 형태
  signatureJson: string       // PolicyInput.signature의 직렬화 형태
  policyVersion: number
  updatedAt: number
}
```

변경 후:
```ts
export interface PolicyInput {
  policies: unknown[]
  signature: Record<string, unknown>
}

export interface StoredPolicy extends PolicyInput {
  accountIndex: number
  chainId: number
  policyVersion: number
  updatedAt: number
}
```

**제거되는 필드**: policiesJson, signatureJson
**상속되는 필드**: policies (unknown[]), signature (Record<string, unknown>)
**Breaking change**: 모든 `stored.policiesJson` 접근 지점이 `stored.policies`로, `stored.signatureJson` 접근 지점이 `stored.signature`로 변경 필요

---

### Step 2: store 구현 -- JsonApprovalStore 수정 (json-approval-store.ts)

**파일**: `packages/guarded-wdk/src/json-approval-store.ts`
**위험도**: Low -- 내부 구현 변경, 저장 형식 불변

#### 2a. loadPolicy: 반환 시 parse

현재 (line 189-201):
```ts
override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
  const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
  const key = `${accountIndex}:${chainId}`
  const row = policies[key]
  if (!row) return null
  return {
    accountIndex: row.account_index,
    chainId: row.chain_id,
    policiesJson: row.policies_json,       // string 그대로 반환
    signatureJson: row.signature_json,     // string 그대로 반환
    policyVersion: row.policy_version,
    updatedAt: row.updated_at
  }
}
```

변경 후:
```ts
override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
  const policies = await this._read<Record<string, PolicyRow>>('policies.json') || {}
  const key = `${accountIndex}:${chainId}`
  const row = policies[key]
  if (!row) return null
  return {
    accountIndex: row.account_index,
    chainId: row.chain_id,
    policies: JSON.parse(row.policies_json) as unknown[],
    signature: JSON.parse(row.signature_json) as Record<string, unknown>,
    policyVersion: row.policy_version,
    updatedAt: row.updated_at
  }
}
```

#### 2b. savePolicy: 변경 없음

현재 savePolicy는 이미 `JSON.stringify(input.policies)`와 `JSON.stringify(input.signature)`로 직렬화하고 있다. PolicyInput 인터페이스를 받으므로 변경 불필요.

---

### Step 3: store 구현 -- SqliteApprovalStore 수정 (sqlite-approval-store.ts)

**파일**: `packages/guarded-wdk/src/sqlite-approval-store.ts`
**위험도**: Low -- 내부 구현 변경, DB 스키마 불변

#### 3a. loadPolicy: 반환 시 parse

현재 (line 213-225):
```ts
override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
  const row = this._db!.prepare(
    'SELECT * FROM policies WHERE account_index = ? AND chain_id = ?'
  ).get(accountIndex, chainId) as PolicyRow | undefined
  if (!row) return null
  return {
    accountIndex: row.account_index,
    chainId: row.chain_id,
    policiesJson: row.policies_json,       // string 그대로 반환
    signatureJson: row.signature_json,     // string 그대로 반환
    policyVersion: row.policy_version,
    updatedAt: row.updated_at
  }
}
```

변경 후:
```ts
override async loadPolicy (accountIndex: number, chainId: number): Promise<StoredPolicy | null> {
  const row = this._db!.prepare(
    'SELECT * FROM policies WHERE account_index = ? AND chain_id = ?'
  ).get(accountIndex, chainId) as PolicyRow | undefined
  if (!row) return null
  return {
    accountIndex: row.account_index,
    chainId: row.chain_id,
    policies: JSON.parse(row.policies_json) as unknown[],
    signature: JSON.parse(row.signature_json) as Record<string, unknown>,
    policyVersion: row.policy_version,
    updatedAt: row.updated_at
  }
}
```

#### 3b. savePolicy: 변경 없음

SqliteApprovalStore.savePolicy도 이미 `JSON.stringify(input.policies)`를 사용하므로 변경 불필요.

**참고**: `savePolicy()`는 내부적으로 `loadPolicy()`를 호출하여 기존 version을 조회한다. loadPolicy에 JSON.parse가 추가되므로, 저장된 JSON이 깨진 경우 overwrite도 실패하게 되는데, 이는 **의도된 보수적 동작**이다 — 깨진 데이터 위에 덮어쓰는 것보다 명시적으로 실패하는 것이 No Fallback 원칙에 부합한다.

---

### Step 4: guarded-wdk 내부 소비자 수정 (guarded-wdk-factory.ts)

**파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`
**위험도**: Low -- stored.policiesJson -> stored.policies

#### 4a. store hydration 코드 (line 96-101)

현재:
```ts
const stored = await approvalStore.loadPolicy(0, Number(chainKey))
if (stored && stored.policiesJson) {
  policiesStore[chainKey] = deepCopy({ ...stored, policies: JSON.parse(stored.policiesJson) }) as Record<string, unknown>
}
```

변경 후:
```ts
const stored = await approvalStore.loadPolicy(0, Number(chainKey))
if (stored && stored.policies) {
  policiesStore[chainKey] = deepCopy(stored) as Record<string, unknown>
}
```

**변경 사유**: StoredPolicy가 이제 policies 필드를 직접 포함하므로 JSON.parse 불필요. stored 자체를 deepCopy하면 됨.

---

### Step 5: daemon 소비자 수정 (wdk-host.ts, tool-surface.ts)

**파일**: `packages/daemon/src/wdk-host.ts`
**위험도**: Low

#### 5a. wdk-host.ts policy restore (line 83-86)

현재:
```ts
const stored = await store.loadPolicy(0, chainId)
if (stored) {
  const policiesArr = JSON.parse(stored.policiesJson)
  restoredPolicies[chainIdStr] = { policies: policiesArr }
```

변경 후:
```ts
const stored = await store.loadPolicy(0, chainId)
if (stored) {
  restoredPolicies[chainIdStr] = { policies: stored.policies }
```

---

**파일**: `packages/daemon/src/tool-surface.ts`
**위험도**: Low

#### 5b. swapPoliciesForWallet (line 278-281)

현재:
```ts
const stored = await store.loadPolicy(accountIndex, chainId)
if (stored && wdk.updatePolicies) {
  await wdk.updatePolicies(chainId, { policies: JSON.parse(stored.policiesJson) }, accountIndex)
}
```

변경 후:
```ts
const stored = await store.loadPolicy(accountIndex, chainId)
if (stored && wdk.updatePolicies) {
  await wdk.updatePolicies(chainId, { policies: stored.policies }, accountIndex)
}
```

#### 5c. policyList tool (line 513)

현재:
```ts
return { policies: policy ? JSON.parse(policy.policiesJson) : [] }
```

변경 후:
```ts
return { policies: policy ? policy.policies : [] }
```

---

### Step 6: 테스트 수정

#### 6a. guarded-wdk/tests/json-approval-store.test.ts

**변경 지점 2개**:

Line 129 -- round-trip 테스트:
```ts
// 현재
expect(loaded!.policiesJson).toBe('[{"maxAmount":"1000"}]')
// 변경
expect(loaded!.policies).toEqual([{ maxAmount: '1000' }])
```

Lines 154-155 -- empty policy 테스트:
```ts
// 현재
expect(loaded!.policiesJson).toBe('[]')
expect(loaded!.signatureJson).toBe('{}')
// 변경
expect(loaded!.policies).toEqual([])
expect(loaded!.signature).toEqual({})
```

#### 6b. guarded-wdk/tests/sqlite-approval-store.test.ts

**변경 지점 5개**:

Line 129 -- round-trip 테스트:
```ts
// 현재
expect(loaded!.policiesJson).toBe('[{"maxAmount":"1000"}]')
// 변경
expect(loaded!.policies).toEqual([{ maxAmount: '1000' }])
```

Lines 158-162 -- scoping 테스트:
```ts
// 현재
expect(p1!.policiesJson).toBe('[{"a0":"eth"}]')
expect(p2!.policiesJson).toBe('[{"a1":"eth"}]')
expect(p3!.policiesJson).toBe('[{"a0":"sol"}]')
// 변경
expect(p1!.policies).toEqual([{ a0: 'eth' }])
expect(p2!.policies).toEqual([{ a1: 'eth' }])
expect(p3!.policies).toEqual([{ a0: 'sol' }])
```

Lines 168-169 -- empty policy 테스트:
```ts
// 현재
expect(loaded!.policiesJson).toBe('[]')
expect(loaded!.signatureJson).toBe('{}')
// 변경
expect(loaded!.policies).toEqual([])
expect(loaded!.signature).toEqual({})
```

#### 6c. guarded-wdk/tests/factory.test.ts + integration.test.ts

**MockApprovalStore.savePolicy** (두 파일에 동일한 mock 존재):

현재 (factory.test.ts line 61, integration.test.ts line 32):
```ts
override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput) {
  this._policies[`${accountIndex}:${chainId}`] = {
    ...input,
    policiesJson: JSON.stringify(input.policies),
    accountIndex, chainId, policyVersion: 0, updatedAt: Date.now()
  }
}
```

변경 후:
```ts
override async savePolicy (accountIndex: number, chainId: number, input: PolicyInput) {
  this._policies[`${accountIndex}:${chainId}`] = {
    ...input,
    accountIndex, chainId, policyVersion: 0, updatedAt: Date.now()
  }
}
```

**policiesJson 접근 assertions** (factory.test.ts lines 225, 302):
```ts
// 현재
expect(JSON.parse(saved.policiesJson as string)).toEqual(newPolicies.policies)
// 변경
expect(saved.policies).toEqual(newPolicies.policies)
```

#### 6d. daemon/tests/tool-surface.test.ts

**createMockStore.loadPolicy** (line 51-58):

현재:
```ts
loadPolicy: jest.fn<...>().mockResolvedValue({
  policiesJson: JSON.stringify([{ type: 'auto', maxUsd: 100 }]),
  signatureJson: '{}',
  accountIndex: 0,
  chainId: 1,
  policyVersion: 1,
  updatedAt: Date.now()
})
```

변경 후:
```ts
loadPolicy: jest.fn<...>().mockResolvedValue({
  policies: [{ type: 'auto', maxUsd: 100 }],
  signature: {},
  accountIndex: 0,
  chainId: 1,
  policyVersion: 1,
  updatedAt: Date.now()
})
```

---

## 구현 순서와 브레이킹 윈도우 최소화

```
Step 1 (타입 정의)
  |
  +---> Step 2 (JsonApprovalStore.loadPolicy)  --+
  |                                               |
  +---> Step 3 (SqliteApprovalStore.loadPolicy) --+
                                                  |
                                        Step 4 (guarded-wdk-factory)
                                                  |
                                        Step 5 (daemon 소비자)
                                                  |
                                        Step 6 (테스트)
```

**권장 실행 순서**: Step 1 -> Step 2+3 (동시) -> Step 4+5 (동시) -> Step 6

**브레이킹 윈도우**: Step 1 완료 시점부터 Step 6 완료 시점까지 TS 컴파일 에러가 발생한다. 전체 변경을 **단일 커밋으로 수행하면 브레이킹 윈도우 = 0**.

단일 커밋이 적합한 이유:
- 변경 파일 10개 미만
- 변경 라인 ~50줄 (대부분 필드명 치환)
- 모든 변경이 단일 타입 변경의 cascade

---

## 위험 평가

| 위험 | 심각도 | 발생 확률 | 완화 방안 |
|------|--------|-----------|-----------|
| StoredCron/StoredJournal extends 후 shape 불일치 | Low | 극히 낮음 | shape이 완전 동일하므로 소비자 영향 없음. TS 컴파일러가 검증 |
| StoredPolicy.policiesJson 접근 지점 누락 | Medium | 낮음 | grep으로 policiesJson/signatureJson 전수 검색 완료 (본 문서 Step 5까지 모두 커버) |
| JSON.parse 위치 이동으로 인한 파싱 에러 | Low | 극히 낮음 | 기존 코드도 동일한 parse를 수행하고 있었음. 위치만 store 내부로 이동 |
| store-types.ts PolicyRow와 public StoredPolicy의 혼동 | Low | 낮음 | PolicyRow는 @internal, StoredPolicy는 public으로 역할 분리 명확 |
| 외부 패키지(app)에서 policiesJson 접근 | None | 없음 | grep 검증 완료: app 패키지에 policiesJson/signatureJson 참조 0건 |

## 롤백 전략

단일 커밋으로 수행하므로 `git revert <commit>` 한 줄로 완전 롤백 가능.

## 테스팅 전략

1. **TS 컴파일**: 패키지 단위 타입 검사 — `cd packages/guarded-wdk && npm run typecheck`, `cd packages/daemon && npm run build`
2. **guarded-wdk 단위 테스트**: json-approval-store.test.ts, sqlite-approval-store.test.ts의 policy round-trip 테스트가 새 필드명(policies, signature)으로 검증
3. **guarded-wdk 통합 테스트**: factory.test.ts, integration.test.ts의 MockApprovalStore가 새 인터페이스와 일치
4. **daemon 테스트**: tool-surface.test.ts의 mock store가 새 인터페이스와 일치
5. **grep 검증**: `packages/` 범위에서 `policiesJson` 또는 `signatureJson` 잔존 0건 (src/, tests/ 대상. docs/ 제외)

## 성공 지표

1. StoredCron, StoredJournal, StoredPolicy가 각각 CronInput, JournalInput, PolicyInput을 extends
2. `packages/` 범위(src/, tests/)에서 `policiesJson`/`signatureJson` 참조 0건 (docs/ 제외)
3. 전체 테스트 통과
4. store 내부 저장 형식(SQLite 컬럼명, JSON 파일 키) 변경 없음

---

## 변경 대상 파일 요약

| 파일 | 변경 내용 | 라인 수 (추정) |
|------|-----------|---------------|
| `packages/guarded-wdk/src/approval-store.ts` | 3개 interface를 extends로 전환 | -14 lines |
| `packages/guarded-wdk/src/json-approval-store.ts` | loadPolicy에서 JSON.parse 추가 | ~4 lines |
| `packages/guarded-wdk/src/sqlite-approval-store.ts` | loadPolicy에서 JSON.parse 추가 | ~4 lines |
| `packages/guarded-wdk/src/guarded-wdk-factory.ts` | stored.policiesJson -> stored.policies | ~3 lines |
| `packages/daemon/src/wdk-host.ts` | JSON.parse(stored.policiesJson) -> stored.policies | ~2 lines |
| `packages/daemon/src/tool-surface.ts` | JSON.parse(stored/policy.policiesJson) -> .policies (3곳) | ~3 lines |
| `packages/guarded-wdk/tests/json-approval-store.test.ts` | policiesJson/signatureJson assertions 변경 | ~4 lines |
| `packages/guarded-wdk/tests/sqlite-approval-store.test.ts` | policiesJson/signatureJson assertions 변경 | ~8 lines |
| `packages/guarded-wdk/tests/factory.test.ts` | MockApprovalStore + assertion 변경 | ~4 lines |
| `packages/guarded-wdk/tests/integration.test.ts` | MockApprovalStore 변경 | ~2 lines |
| `packages/daemon/tests/tool-surface.test.ts` | mock store 변경 | ~4 lines |
| **합계** | | **~52 lines** |
