# Step 05: guarded-wdk - ApprovalStore 추상 인터페이스

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 03, Step 04

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/approval-store.js`에 ApprovalStore 추상 클래스 정의. 모든 메서드가 `throw new Error('Not implemented')`를 던지는 추상 인터페이스. JsonApprovalStore와 SqliteApprovalStore가 이를 상속.

### 메서드 목록 (PRD ApprovalStore 인터페이스)

```javascript
class ApprovalStore {
  // Active policy (seed별, chain별)
  async loadPolicy(seedId, chain) {}       // → SignedPolicy | null
  async savePolicy(seedId, chain, signedPolicy) {}

  // Pending requests (policy 요청 + tx 승인 대기)
  async loadPending(seedId, type?, chain?) {}  // → PendingRequest[]
  async savePending(seedId, request) {}
  async removePending(requestId) {}

  // History (감사 추적)
  async appendHistory(seedId, entry) {}
  async getHistory(seedId, opts?) {}       // → HistoryEntry[]

  // 디바이스
  async saveDevice(deviceId, publicKey, name?) {}
  async getDevice(deviceId) {}             // → Device | null
  async revokeDevice(deviceId) {}
  async listDevices() {}                   // → Device[]

  // Nonce 추적 (per-approver + per-device)
  async getLastNonce(approver, deviceId) {}  // → number
  async updateNonce(approver, deviceId, nonce) {}

  // Cron 관리 (seed별)
  async listCrons(seedId) {}               // → CronEntry[]
  async saveCron(seedId, cron) {}
  async removeCron(cronId) {}
  async updateCronLastRun(cronId, timestamp) {}

  // Seed 관리 (다중 seed)
  async listSeeds() {}                     // → SeedEntry[]
  async getSeed(seedId) {}                 // → SeedEntry | null
  async addSeed(name, mnemonic) {}         // → SeedEntry
  async removeSeed(seedId) {}
  async setActiveSeed(seedId) {}
  async getActiveSeed() {}                 // → SeedEntry | null
}
```

### 데이터 타입 정의 (JSDoc)

```javascript
/**
 * @typedef {Object} SignedPolicy
 * @property {string} seedId
 * @property {string} chain
 * @property {Object[]} policies
 * @property {Object} signature - SignedApproval
 * @property {string} wdkCounterSig
 * @property {number} policyVersion
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} PendingRequest
 * @property {string} requestId
 * @property {string} seedId
 * @property {string} type - 'tx' | 'policy' | 'policy_reject' | 'device_revoke'
 * @property {string} chain
 * @property {string} targetHash
 * @property {Object} [metadata]
 * @property {number} createdAt
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} seedId
 * @property {string} type
 * @property {string} [chain]
 * @property {string} targetHash
 * @property {string} approver
 * @property {string} deviceId
 * @property {string} action - 'approved' | 'rejected' | 'requested'
 * @property {Object} [signedApproval]
 * @property {number} timestamp
 */

/**
 * @typedef {Object} Device
 * @property {string} deviceId
 * @property {string} publicKey
 * @property {string} [name]
 * @property {number} pairedAt
 * @property {number|null} revokedAt
 */

/**
 * @typedef {Object} CronEntry
 * @property {string} id
 * @property {string} seedId
 * @property {string} sessionId
 * @property {string} interval
 * @property {string} prompt
 * @property {string} [chain]
 * @property {number} createdAt
 * @property {number|null} lastRunAt
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} SeedEntry
 * @property {string} id
 * @property {string} name
 * @property {string} mnemonic
 * @property {number} createdAt
 * @property {boolean} isActive
 */
```

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/approval-store.js` 파일 생성
- [ ] `ApprovalStore` 클래스가 export됨
- [ ] 모든 메서드(22개)가 `throw new Error('Not implemented')` 던짐
  - loadPolicy, savePolicy
  - loadPending, savePending, removePending
  - appendHistory, getHistory
  - saveDevice, getDevice, revokeDevice, listDevices
  - getLastNonce, updateNonce
  - listCrons, saveCron, removeCron, updateCronLastRun
  - listSeeds, getSeed, addSeed, removeSeed, setActiveSeed, getActiveSeed
- [ ] 각 메서드가 async (Promise 반환)
- [ ] JSDoc 타입 정의 포함 (SignedPolicy, PendingRequest, HistoryEntry, Device, CronEntry, SeedEntry)
- [ ] `src/index.js`에서 `ApprovalStore` re-export
- [ ] `new ApprovalStore().loadPolicy('seed1', 'ethereum')` → Error('Not implemented') throw
- [ ] `npm test -- packages/guarded-wdk` 통과 (기존 43개 테스트 깨지지 않음)

## 3. 롤백 방법
- `packages/guarded-wdk/src/approval-store.js` 삭제
- `index.js`에서 `ApprovalStore` re-export 제거

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/src/approval-store.js     # ApprovalStore 추상 클래스
packages/guarded-wdk/tests/approval-store.test.js  # 추상 인터페이스 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/index.js   # ApprovalStore re-export 추가
```

### Side Effect 위험
- 없음 (신규 파일 + index.js에 export 추가만)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.js | ApprovalStore 추상 인터페이스 (PRD) | ✅ OK |
| approval-store.test.js | 인터페이스 계약 테스트 | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 22개 메서드 시그니처 | ✅ approval-store.js | OK |
| JSDoc 타입 정의 | ✅ approval-store.js | OK |
| 다중 seed 지원 (seedId 파라미터) | ✅ approval-store.js | OK |
| cron 메서드 | ✅ approval-store.js | OK |
| nonce 메서드 | ✅ approval-store.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 06: guarded-wdk - JsonApprovalStore](step-06-json-approval-store.md)
