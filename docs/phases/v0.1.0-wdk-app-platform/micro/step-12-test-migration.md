# Step 12: guarded-wdk - 테스트 마이그레이션 (InMemory → Signed + 신규 테스트)

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 11 (middleware 마이그레이션)

---

## 1. 구현 내용 (design.md 기반)

기존 43개 테스트를 `InMemoryApprovalBroker`에서 `SignedApprovalBroker`로 마이그레이션하고, 신규 모듈(approval-verifier, signed-approval-broker, approval-store, canonical)에 대한 테스트를 추가. **목표: 100+ 테스트**.

### 기존 테스트 마이그레이션 (43개)

기존 테스트는 `InMemoryApprovalBroker`의 간단한 API(`request()`, `waitForApproval()`, `consume()`)를 사용. `SignedApprovalBroker`는 Ed25519 서명이 필요하므로 테스트 헬퍼가 필수.

#### 테스트 헬퍼: `createTestApproval`

```javascript
import nacl from 'tweetnacl'
import { canonicalJSON } from '@wdk-app/canonical'
import { createHash } from 'crypto'

/**
 * 테스트용 SignedApproval 생성
 * @param {Object} params - { type, chain, targetHash, requestId, nonce, expiresAt }
 * @param {Uint8Array} secretKey - Ed25519 secret key (64 bytes)
 * @param {string} approver - hex public key
 * @param {string} deviceId
 * @returns {SignedApproval}
 */
function createTestApproval(params, secretKey, approver, deviceId) {
  const unsigned = {
    type: params.type || 'tx',
    targetHash: params.targetHash,
    approver,
    deviceId,
    chain: params.chain || 'ethereum',
    requestId: params.requestId,
    policyVersion: params.policyVersion || 1,
    expiresAt: params.expiresAt || Math.floor(Date.now() / 1000) + 300,
    nonce: params.nonce || 1,
  }
  const message = canonicalJSON(unsigned)
  const messageHash = createHash('sha256').update(message).digest()
  const sig = Buffer.from(nacl.sign.detached(messageHash, secretKey)).toString('hex')
  return { ...unsigned, sig }
}
```

#### 마이그레이션 패턴

```javascript
// 기존 (InMemoryApprovalBroker)
const broker = new InMemoryApprovalBroker()
// ... test에서 broker.approve(ticketId) 호출

// 신규 (SignedApprovalBroker)
const keyPair = nacl.sign.keyPair()
const approver = Buffer.from(keyPair.publicKey).toString('hex')
const store = new JsonApprovalStore(tempDir)
const broker = new SignedApprovalBroker([approver], store)

// 승인 시: createTestApproval → broker.submitApproval
```

기존 테스트의 `broker.approve()` 호출을 `broker.submitApproval(createTestApproval(...))` 패턴으로 교체. 나머지 assertion은 동일.

### 신규 테스트

#### approval-verifier 테스트 (6단계 각각)

```
packages/guarded-wdk/tests/approval-verifier.test.js
```

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | untrusted approver → UntrustedApproverError | trustedApprovers에 없는 키 |
| 2 | trusted approver → 통과 | trustedApprovers에 있는 키 |
| 3 | revoked device → DeviceRevokedError | store.getDevice → revokedAt !== null |
| 4 | active device → 통과 | store.getDevice → revokedAt === null |
| 5 | invalid signature → SignatureError | 잘못된 sig |
| 6 | valid signature → 통과 | 올바른 Ed25519 서명 |
| 7 | expired approval → ApprovalExpiredError | expiresAt < now |
| 8 | non-expired → 통과 | expiresAt > now |
| 9 | nonce ≤ lastNonce → ReplayError | 동일/이전 nonce |
| 10 | nonce > lastNonce → 통과 | 새 nonce |
| 11 | tx targetHash 불일치 → Error | 다른 targetHash |
| 12 | policy targetHash 불일치 → Error | policyHash 불일치 |
| 13 | device_revoke targetHash 불일치 → Error | SHA-256(deviceId) 불일치 |
| 14 | cross-chain replay 방지 | chain 필드가 서명에 포함 |
| 15 | computeSignaturePayload 정확성 | sig 제외 canonicalHash |

#### signed-approval-broker 테스트

```
packages/guarded-wdk/tests/signed-approval-broker.test.js
```

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | createRequest → ApprovalRequest 반환 | 올바른 구조 |
| 2 | createRequest → store.savePending 호출 | 영속 저장 |
| 3 | submitApproval (valid) → Promise resolve | 6단계 통과 |
| 4 | submitApproval (invalid) → 에러 throw | 검증 실패 |
| 5 | waitForApproval → 타임아웃 → ApprovalTimeoutError | 60초 초과 |
| 6 | waitForApproval → submitApproval → resolve | 정상 흐름 |
| 7 | submitApproval type='policy' → countersign + savePolicy | policy 승인 |
| 8 | submitApproval type='policy_reject' → history 'rejected' | policy 거부 |
| 9 | submitApproval type='device_revoke' → revokeDevice | device 폐기 |
| 10 | nonce 업데이트 확인 | store.updateNonce 호출 |
| 11 | history 기록 확인 | store.appendHistory 호출 |
| 12 | pending 제거 확인 | store.removePending 호출 |

#### approval-store 테스트 (JSON + SQLite)

```
packages/guarded-wdk/tests/json-approval-store.test.js
packages/guarded-wdk/tests/sqlite-approval-store.test.js
```

각 구현에 대해 동일한 테스트 세트:

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | savePending + getPending | 저장 + 조회 |
| 2 | removePending | 삭제 |
| 3 | savePolicy + getPolicy | policy 저장 + 조회 |
| 4 | appendHistory + getHistory | 이력 저장 + 조회 |
| 5 | updateNonce + getLastNonce | nonce 관리 |
| 6 | getDevice (active) | 활성 디바이스 조회 |
| 7 | revokeDevice + getDevice (revoked) | 폐기 + 조회 |
| 8 | 빈 store에서 조회 → 기본값 | 초기 상태 |

#### canonical 해시 테스트 (추가)

```
packages/canonical/tests/hash.test.js
```

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | intentHash 결정성 | 동일 입력 → 동일 해시 |
| 2 | intentHash 키 순서 무관 | { a, b } === { b, a } |
| 3 | policyHash 결정성 | 동일 입력 → 동일 해시 |
| 4 | canonicalJSON 특수문자 | 이스케이프 처리 |
| 5 | sortKeysDeep 중첩 객체 | 깊은 정렬 |

### 테스트 수 계산

| 카테고리 | 개수 |
|---------|------|
| 기존 마이그레이션 | 43 |
| approval-verifier | 15 |
| signed-approval-broker | 12 |
| json-approval-store | 8 |
| sqlite-approval-store | 8 |
| canonical 해시 | 5 |
| 기타 (에러 클래스, factory 확장 등) | 10+ |
| **합계** | **101+** |

## 2. 완료 조건
- [ ] 기존 43개 테스트가 `SignedApprovalBroker`로 마이그레이션되어 통과
- [ ] `createTestApproval` 헬퍼 함수가 `tests/helpers/` 또는 테스트 파일 내에 존재
- [ ] `approval-verifier.test.js`: 6단계 각각 성공/실패 (15개+) 통과
- [ ] `signed-approval-broker.test.js`: createRequest, submitApproval, waitForApproval (12개+) 통과
- [ ] `json-approval-store.test.js`: CRUD 전체 (8개+) 통과
- [ ] `sqlite-approval-store.test.js`: CRUD 전체 (8개+) 통과
- [ ] `canonical/tests/hash.test.js`: 결정성 + 엣지케이스 (5개+) 통과
- [ ] 총 테스트 수 100개 이상
- [ ] `npm test -- packages/guarded-wdk` 전체 통과 (0 failures)
- [ ] `npm test -- packages/canonical` 전체 통과
- [ ] `approval-broker.test.js` 삭제 (InMemoryApprovalBroker 테스트)
- [ ] 테스트에서 실제 Ed25519 키페어 생성 + 서명 (mock 아님)
- [ ] 각 테스트가 독립적 (다른 테스트 결과에 의존하지 않음)
- [ ] 임시 디렉토리/DB 사용 후 정리 (afterEach cleanup)

## 3. 롤백 방법
- 마이그레이션된 테스트 파일을 git checkout으로 원복
- 신규 테스트 파일 삭제
- `approval-broker.test.js` 복원

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/tests/helpers/create-test-approval.js  # 테스트 헬퍼
packages/guarded-wdk/tests/approval-verifier.test.js         # 6단계 검증 테스트
packages/guarded-wdk/tests/signed-approval-broker.test.js    # broker 테스트
packages/guarded-wdk/tests/json-approval-store.test.js       # JSON store 테스트
packages/guarded-wdk/tests/sqlite-approval-store.test.js     # SQLite store 테스트
packages/canonical/tests/hash.test.js                        # canonical 해시 테스트 (추가)
```

### 수정 대상 파일
```
packages/guarded-wdk/tests/guarded-wdk.test.js  # 기존 43개 테스트 → SignedApprovalBroker 마이그레이션
```

### 삭제 대상 파일
```
packages/guarded-wdk/tests/approval-broker.test.js  # InMemoryApprovalBroker 테스트 삭제
```

### Side Effect 위험
- 기존 테스트 파일 수정 — broker 교체로 인한 전면 수정
- `tweetnacl` 개발 의존성 (이미 Step 08에서 추가됨)
- 임시 파일/DB 생성 (테스트 후 정리)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| create-test-approval.js | 테스트 헬퍼 (Ed25519 서명 생성) | ✅ OK |
| approval-verifier.test.js | DoD F1,F3,F8,F10,F11,F12, E1,E2 | ✅ OK |
| signed-approval-broker.test.js | DoD F6-F13, E1-E3 | ✅ OK |
| json-approval-store.test.js | ApprovalStore 인터페이스 테스트 | ✅ OK |
| sqlite-approval-store.test.js | ApprovalStore 인터페이스 테스트 | ✅ OK |
| canonical hash.test.js | 해시 결정성 검증 | ✅ OK |
| 기존 테스트 수정 | broker 마이그레이션 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 기존 43개 마이그레이션 | ✅ guarded-wdk.test.js | OK |
| 6단계 검증 테스트 | ✅ approval-verifier.test.js | OK |
| broker 단위 테스트 | ✅ signed-approval-broker.test.js | OK |
| store CRUD 테스트 (JSON) | ✅ json-approval-store.test.js | OK |
| store CRUD 테스트 (SQLite) | ✅ sqlite-approval-store.test.js | OK |
| canonical 해시 테스트 | ✅ hash.test.js | OK |
| 100+ 테스트 목표 | ✅ 합계 101+ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 13: manifest - 타입 정의 + getPolicyManifest](step-13-manifest-types.md)
