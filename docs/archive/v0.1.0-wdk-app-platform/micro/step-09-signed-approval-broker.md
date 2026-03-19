# Step 09: guarded-wdk - SignedApprovalBroker

## 메타데이터
- **난이도**: 🔴 매우 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 08 (approval-verifier), Step 05 (ApprovalStore 인터페이스)

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/signed-approval-broker.js`에 SignedApprovalBroker 구현. 기존 `InMemoryApprovalBroker`를 완전 대체하는 breaking change. tx 승인 + policy 승인 + device 관리를 하나의 검증 파이프라인으로 통합.

### 클래스 구조

```javascript
class SignedApprovalBroker {
  /**
   * @param {string[]} trustedApprovers - 신뢰된 approver public key 목록
   * @param {ApprovalStore} store - 영속 저장소
   */
  constructor(trustedApprovers, store)

  /**
   * 요청 생성 (WDK 내부 또는 daemon이 호출)
   * @param {string} type - 'tx' | 'policy' | 'policy_reject' | 'device_revoke'
   * @param {Object} params - { chain, targetHash, requestId, metadata }
   * @returns {Promise<ApprovalRequest>}
   */
  async createRequest(type, { chain, targetHash, requestId, metadata })

  /**
   * 서명된 승인 제출 (daemon이 control channel에서 수신 후 호출)
   * @param {SignedApproval} signedApproval
   * @returns {Promise<void>}
   * @throws {UntrustedApproverError|DeviceRevokedError|SignatureError|ApprovalExpiredError|ReplayError}
   */
  async submitApproval(signedApproval)

  /**
   * 대기 (WDK 내부에서 REQUIRE_APPROVAL 시 호출)
   * @param {string} requestId
   * @param {number} timeoutMs - 기본 60000ms
   * @returns {Promise<SignedApproval>}
   * @throws {ApprovalTimeoutError}
   */
  async waitForApproval(requestId, timeoutMs = 60000)
}
```

### createRequest 동작

1. `ApprovalRequest` 객체 생성: `{ requestId, type, chain, targetHash, metadata, createdAt }`
2. `store.savePending(seedId, request)` 호출 → 영속 저장
3. 이벤트 emit 가능하도록 emitter 참조 보유 (optional)
4. 반환: `ApprovalRequest`

### submitApproval 동작

1. `verifyApproval(signedApproval, this.trustedApprovers, this.store)` 호출
   - 6단계 검증 통과 시 진행, 실패 시 에러 throw
2. `store.updateNonce(approver, deviceId, nonce)` — nonce 업데이트
3. type별 후처리:
   - **tx**: 해당 requestId의 대기 중인 Promise를 resolve
   - **policy**: WDK countersign 생성 → `store.savePolicy(seedId, chain, signedPolicy)` → pending 제거
   - **policy_reject**: pending 제거 + history에 'rejected' 기록
   - **device_revoke**: `store.revokeDevice(deviceId)` 호출
4. `store.appendHistory(seedId, historyEntry)` — 감사 추적
5. `store.removePending(requestId)` — pending 제거

### waitForApproval 동작

1. `Promise` 생성, 내부 Map에 `requestId → { resolve, reject }` 저장
2. 타임아웃 설정: `setTimeout(() => reject(new ApprovalTimeoutError(requestId)), timeoutMs)`
3. `submitApproval`에서 해당 requestId의 resolve 호출 시 Promise resolve
4. 타임아웃 시 `ApprovalTimeoutError` throw

### 내부 상태

```javascript
this._waiters = new Map()  // requestId → { resolve, reject, timer }
this.trustedApprovers = trustedApprovers
this.store = store
```

### WDK countersign (policy 승인 시)

policy 승인 시 daemon의 seed로 countersign 수행. 이 step에서는 countersign 콜백을 생성자 옵션으로 받음:

```javascript
constructor(trustedApprovers, store, { countersign } = {})
// countersign: async (policies, chain) => wdkCounterSig
```

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/signed-approval-broker.js` 파일 생성
- [ ] `SignedApprovalBroker` 클래스 export
- [ ] **createRequest**: ApprovalRequest 반환 (DoD F6)
- [ ] **createRequest**: store.savePending 호출되어 영속 저장
- [ ] **submitApproval**: 유효한 SignedApproval → Promise resolve (DoD F7)
- [ ] **submitApproval**: 무효한 SignedApproval → 에러 throw (DoD F8, 6종 에러)
- [ ] **submitApproval**: nonce 업데이트됨 (store.updateNonce 호출)
- [ ] **submitApproval**: history 기록됨 (store.appendHistory 호출)
- [ ] **submitApproval**: pending 제거됨 (store.removePending 호출)
- [ ] **submitApproval type='policy'**: countersign 수행 → store.savePolicy 호출 (DoD F13)
- [ ] **submitApproval type='device_revoke'**: store.revokeDevice 호출
- [ ] **waitForApproval**: 타임아웃 시 ApprovalTimeoutError throw (DoD F9)
- [ ] **waitForApproval**: submitApproval로 resolve 시 SignedApproval 반환
- [ ] nonce replay 방지: 동일 approver+deviceId의 이전 nonce → ReplayError (DoD F10)
- [ ] cross-chain: chain 필드가 서명에 포함 (DoD F11)
- [ ] `src/index.js`에서 `SignedApprovalBroker` re-export
- [ ] `npm test -- packages/guarded-wdk` 통과

## 3. 롤백 방법
- `packages/guarded-wdk/src/signed-approval-broker.js` 삭제
- `index.js`에서 `SignedApprovalBroker` re-export 제거

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/src/signed-approval-broker.js        # SignedApprovalBroker
packages/guarded-wdk/tests/signed-approval-broker.test.js  # broker 단위 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/index.js   # SignedApprovalBroker re-export 추가
```

### Side Effect 위험
- 없음 (신규 파일 + export 추가만. 기존 approval-broker.js는 아직 삭제하지 않음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| signed-approval-broker.js | PRD SignedApprovalBroker | ✅ OK |
| signed-approval-broker.test.js | DoD F6-F13, E1-E3 | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| createRequest + 영속 저장 | ✅ signed-approval-broker.js | OK |
| submitApproval + verifyApproval 연동 | ✅ signed-approval-broker.js | OK |
| waitForApproval + 타임아웃 | ✅ signed-approval-broker.js | OK |
| type별 후처리 (tx/policy/policy_reject/device_revoke) | ✅ signed-approval-broker.js | OK |
| countersign 콜백 (policy) | ✅ signed-approval-broker.js | OK |
| nonce 업데이트 + history 기록 | ✅ signed-approval-broker.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 10: guarded-wdk - factory 확장](step-10-factory-extension.md)
