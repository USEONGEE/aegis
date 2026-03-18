# Step 37: app - SignedApprovalBuilder

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 34 (IdentityKeyManager)

---

## 1. 구현 내용 (design.md + PRD 기반)

SignedApprovalBuilder — SignedApproval envelope 생성 + Ed25519 서명.

- `src/core/approval/SignedApprovalBuilder.ts`: SignedApproval 객체 생성
- `src/core/approval/types.ts`: SignedApproval, UnsignedIntent 타입 정의

**SignedApproval Envelope (PRD Spec)**:
```typescript
SignedApproval = {
  type: 'tx' | 'policy' | 'policy_reject' | 'device_revoke',
  targetHash: string,         // intentHash 또는 policyHash
  approver: string,           // identity public key (hex)
  deviceId: string,
  chain: string,
  requestId: string,
  policyVersion: number,      // tx 승인 시
  expiresAt: number,          // Unix timestamp
  nonce: number,              // per-approver-per-device
  sig: string                 // Ed25519 signature (hex)
}
```

**서명 대상**: sig 필드를 제외한 모든 필드를 canonicalJSON 후 Ed25519 sign.

**Builder 패턴**:
```typescript
const approval = await SignedApprovalBuilder
  .forTxApproval({ targetHash, chain, requestId, policyVersion })
  .withIdentity(identityKeyManager)
  .withDeviceId(deviceId)
  .withExpiry(60) // 60초
  .withNonce(nextNonce)
  .build()
```

## 2. 완료 조건
- [ ] `src/core/approval/types.ts` 생성 — SignedApproval, UnsignedIntent 타입 정의
- [ ] `src/core/approval/SignedApprovalBuilder.ts` 생성
- [ ] `forTxApproval({ targetHash, chain, requestId, policyVersion })` → type='tx' 빌더
- [ ] `forPolicyApproval({ targetHash, chain, requestId })` → type='policy' 빌더
- [ ] `forPolicyReject({ targetHash, chain, requestId })` → type='policy_reject' 빌더
- [ ] `forDeviceRevoke({ targetHash, chain, requestId })` → type='device_revoke' 빌더
- [ ] `withIdentity(identityKeyManager)` → approver + 서명 능력 설정
- [ ] `withDeviceId(deviceId)` → deviceId 설정
- [ ] `withExpiry(seconds)` → expiresAt = now + seconds
- [ ] `withNonce(nonce)` → nonce 설정
- [ ] `build()` → canonicalJSON(sig 제외 전체 필드) → Ed25519 sign → SignedApproval 반환
- [ ] 서명 대상은 `@wdk-app/canonical`의 `canonicalJSON`으로 정규화
- [ ] approver 필드는 identity public key의 hex 인코딩
- [ ] sig 필드는 Ed25519 signature의 hex 인코딩
- [ ] 단위 테스트: build → tweetnacl verify → 통과
- [ ] 단위 테스트: 4가지 type 각각 생성 + 서명 검증

## 3. 롤백 방법
- `src/core/approval/` 디렉토리 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/core/approval/
    types.ts                       # SignedApproval, UnsignedIntent 타입
    SignedApprovalBuilder.ts       # Builder 패턴 + Ed25519 서명
  tests/
    signed-approval-builder.test.ts # 단위 테스트
```

### 수정 대상 파일
```
packages/app/package.json          # @wdk-app/canonical 의존성 추가
```

### Side Effect 위험
- 없음 (신규 모듈)
- IdentityKeyManager (Step 34) 의존
- @wdk-app/canonical (Step 01~02) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.ts | 타입 정의 | ✅ OK |
| SignedApprovalBuilder.ts | Builder + 서명 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| SignedApproval 타입 | ✅ types.ts | OK |
| 4가지 type 빌더 | ✅ SignedApprovalBuilder.ts | OK |
| canonicalJSON 정규화 | ✅ SignedApprovalBuilder.ts (@wdk-app/canonical import) | OK |
| Ed25519 서명 | ✅ SignedApprovalBuilder.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 38: app - TxApproval UI](step-38-tx-approval-ui.md)
