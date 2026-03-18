# Step 08: guarded-wdk - approval-verifier (6단계 검증)

## 메타데이터
- **난이도**: 🔴 매우 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 03, Step 04

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/approval-verifier.js`에 6단계 SignedApproval 검증 로직 구현. **시스템 보안의 핵심** — AI(OpenClaw)가 identity key 없이 서명을 우회할 수 없도록 보장하는 유일한 지점 (DoD F1, F3).

### 6단계 검증 (PRD verifyApproval)

```javascript
/**
 * @param {SignedApproval} signedApproval
 * @param {string[]} trustedApprovers - 신뢰된 approver public key 목록
 * @param {ApprovalStore} store - nonce/device 조회용
 * @returns {Promise<void>} - 통과 시 void, 실패 시 에러 throw
 */
async function verifyApproval(signedApproval, trustedApprovers, store) {
  // 1. approver ∈ trustedApprovers?
  //    → 미등록 시: UntrustedApproverError

  // 2. deviceId not revoked?
  //    → store.getDevice(deviceId) → revokedAt !== null 시: DeviceRevokedError

  // 3. Ed25519.verify(sig, canonicalHash(sig 제외 전체 필드), approver)?
  //    → 실패 시: SignatureError
  //    → canonicalHash: @wdk-app/canonical의 sortKeysDeep + SHA-256
  //    → sig 제외 전체 필드를 알파벳 정렬 후 JSON.stringify → SHA-256 → verify

  // 4. expiresAt > now?
  //    → 만료 시: ApprovalExpiredError

  // 5. nonce > lastNonce[approver][deviceId]?
  //    → store.getLastNonce(approver, deviceId) → nonce 비교
  //    → 중복 시: ReplayError

  // 6. type별 추가 검증:
  //    - tx: targetHash 검증 (호출자가 제공한 expectedHash와 비교)
  //         policyVersion 검증 (현재 policy version과 비교)
  //    - policy: targetHash === policyHash(policies) 검증
  //    - device_revoke: targetHash === SHA-256(deviceId) 검증
}
```

### SignedApproval Envelope 구조

```javascript
SignedApproval = {
  type: 'tx' | 'policy' | 'policy_reject' | 'device_revoke',
  targetHash: '0x...',
  approver: '0x...',           // identity public key (hex)
  deviceId: 'device_abc',
  chain: 'ethereum',
  requestId: 'req_123',
  policyVersion: 3,
  expiresAt: 1720000000,       // Unix timestamp (seconds)
  nonce: 42,
  sig: '0xdef...'              // Ed25519 signature (hex)
}
```

### 서명 대상 계산

```javascript
// sig 필드를 제외한 나머지를 canonicalJSON으로 정규화 → SHA-256
const { sig, ...rest } = signedApproval
const message = canonicalJSON(rest)  // sortKeysDeep + JSON.stringify(null, 0)
const messageHash = SHA-256(message) // Buffer
Ed25519.verify(sig, messageHash, approver)
```

### Ed25519 라이브러리

`tweetnacl` (또는 `@noble/ed25519`) 사용. 순수 JS, 번들 작음.

```javascript
import nacl from 'tweetnacl'
// nacl.sign.detached.verify(message, signature, publicKey)
```

### 내보내기 함수

- `verifyApproval(signedApproval, trustedApprovers, store)` — 메인 검증
- `computeSignaturePayload(signedApproval)` — sig 제외 canonicalHash (테스트/디버그용)

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/approval-verifier.js` 파일 생성
- [ ] `verifyApproval` 함수 export
- [ ] `computeSignaturePayload` 함수 export
- [ ] **1단계**: trustedApprovers에 없는 approver → `UntrustedApproverError` throw (DoD F1, F8)
- [ ] **2단계**: revoked 디바이스 → `DeviceRevokedError` throw (DoD F12)
- [ ] **3단계**: 잘못된 서명 → `SignatureError` throw (DoD F3)
- [ ] **3단계**: 올바른 Ed25519 서명 → 통과
- [ ] **4단계**: expiresAt이 과거 → `ApprovalExpiredError` throw (DoD E1)
- [ ] **5단계**: nonce ≤ lastNonce → `ReplayError` throw (DoD F10, E2)
- [ ] **5단계**: nonce > lastNonce → 통과
- [ ] **6단계 tx**: targetHash 불일치 → Error throw
- [ ] **6단계 tx**: policyVersion 불일치 → Error throw
- [ ] **6단계 policy**: targetHash ≠ policyHash(policies) → Error throw
- [ ] **6단계 device_revoke**: targetHash ≠ SHA-256(deviceId) → Error throw
- [ ] 모든 6단계가 순서대로 실행됨 (1단계 실패 시 2~6단계 실행 안 함)
- [ ] cross-chain replay 방지: chain 필드가 서명에 포함됨 (DoD F11)
- [ ] `@wdk-app/canonical`의 `canonicalJSON`, `sortKeysDeep` 사용
- [ ] `tweetnacl`이 `package.json` dependencies에 추가
- [ ] `src/index.js`에서 `verifyApproval` re-export
- [ ] `npm test -- packages/guarded-wdk` 통과

## 3. 롤백 방법
- `packages/guarded-wdk/src/approval-verifier.js` 삭제
- `package.json`에서 `tweetnacl` 의존성 제거
- `index.js`에서 `verifyApproval` re-export 제거

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/src/approval-verifier.js        # 6단계 검증 로직
packages/guarded-wdk/tests/approval-verifier.test.js  # 각 단계별 성공/실패 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/index.js      # verifyApproval re-export 추가
packages/guarded-wdk/package.json      # tweetnacl + @wdk-app/canonical 의존성 추가
```

### Side Effect 위험
- `tweetnacl` 의존성 추가 (순수 JS, 네이티브 바인딩 없음)
- `@wdk-app/canonical` workspace 의존성 추가 (모노레포 내 패키지)
- 기존 코드에 영향 없음

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-verifier.js | PRD 6단계 검증 로직 | ✅ OK |
| approval-verifier.test.js | DoD F1,F3,F8,F10,F11,F12, E1,E2,E3 | ✅ OK |
| package.json 수정 | tweetnacl + canonical 의존성 | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 6단계 검증 각각 | ✅ approval-verifier.js | OK |
| Ed25519 서명 검증 | ✅ approval-verifier.js (tweetnacl) | OK |
| canonicalHash 계산 | ✅ approval-verifier.js (@wdk-app/canonical) | OK |
| type별 추가 검증 (tx/policy/device_revoke) | ✅ approval-verifier.js | OK |
| cross-chain replay 방지 (chain in sig) | ✅ approval-verifier.js | OK |
| computeSignaturePayload (디버그용) | ✅ approval-verifier.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 09: guarded-wdk - SignedApprovalBroker](step-09-signed-approval-broker.md)
