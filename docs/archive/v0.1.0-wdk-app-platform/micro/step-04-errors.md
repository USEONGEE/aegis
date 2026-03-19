# Step 04: guarded-wdk - 에러 클래스 확장

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/errors.js`에 5개 에러 클래스 추가. verifyApproval 6단계 검증에서 각 단계별 실패 시 throw되는 에러.

### 새 에러 클래스

```javascript
// 1단계: approver ∉ trustedApprovers
class SignatureError extends Error {
  constructor(message) {
    super(message || 'Ed25519 signature verification failed.')
    this.name = 'SignatureError'
  }
}

// 1단계: approver ∉ trustedApprovers
class UntrustedApproverError extends Error {
  constructor(approver) {
    super(`Approver is not trusted: ${approver}`)
    this.name = 'UntrustedApproverError'
    this.approver = approver
  }
}

// 2단계: deviceId가 revoked
class DeviceRevokedError extends Error {
  constructor(deviceId) {
    super(`Device has been revoked: ${deviceId}`)
    this.name = 'DeviceRevokedError'
    this.deviceId = deviceId
  }
}

// 4단계: expiresAt ≤ now
class ApprovalExpiredError extends Error {
  constructor(expiresAt) {
    super(`Approval has expired at: ${expiresAt}`)
    this.name = 'ApprovalExpiredError'
    this.expiresAt = expiresAt
  }
}

// 5단계: nonce ≤ lastNonce
class ReplayError extends Error {
  constructor(nonce, lastNonce) {
    super(`Replay detected: nonce ${nonce} <= lastNonce ${lastNonce}`)
    this.name = 'ReplayError'
    this.nonce = nonce
    this.lastNonce = lastNonce
  }
}
```

### 기존 에러 (유지)
- `ForbiddenError` — 메서드 차단
- `PolicyRejectionError` — policy 거부
- `ApprovalTimeoutError` — 승인 타임아웃

## 2. 완료 조건
- [ ] `SignatureError` 클래스가 `errors.js`에서 export
- [ ] `UntrustedApproverError` 클래스가 `errors.js`에서 export, `approver` 프로퍼티 존재
- [ ] `DeviceRevokedError` 클래스가 `errors.js`에서 export, `deviceId` 프로퍼티 존재
- [ ] `ApprovalExpiredError` 클래스가 `errors.js`에서 export, `expiresAt` 프로퍼티 존재
- [ ] `ReplayError` 클래스가 `errors.js`에서 export, `nonce`와 `lastNonce` 프로퍼티 존재
- [ ] 5개 에러 모두 `Error`를 상속하고 `name` 프로퍼티가 올바르게 설정됨
- [ ] 기존 3개 에러(`ForbiddenError`, `PolicyRejectionError`, `ApprovalTimeoutError`)에 변경 없음
- [ ] `src/index.js`에서 5개 새 에러 re-export
- [ ] 각 에러의 `instanceof Error`가 true
- [ ] 각 에러의 `name` 프로퍼티가 클래스 이름과 일치
- [ ] `npm test -- packages/guarded-wdk` 통과 (기존 43개 테스트 깨지지 않음)

## 3. 롤백 방법
- `errors.js`에서 5개 에러 클래스 제거
- `index.js`에서 5개 에러 re-export 제거

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/tests/errors.test.js   # 새 에러 5종 단위 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/errors.js    # 5개 에러 클래스 추가
packages/guarded-wdk/src/index.js     # 5개 에러 re-export 추가
```

### Side Effect 위험
- `errors.js`에 추가만 하므로 기존 에러 import에 영향 없음
- `index.js`에 re-export 추가만 하므로 기존 export에 영향 없음

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| errors.js 수정 | 5개 에러 추가 (design.md 6단계 검증) | ✅ OK |
| index.js 수정 | 새 에러 re-export | ✅ OK |
| errors.test.js | 에러 단위 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| SignatureError | ✅ errors.js | OK |
| UntrustedApproverError | ✅ errors.js | OK |
| DeviceRevokedError | ✅ errors.js | OK |
| ApprovalExpiredError | ✅ errors.js | OK |
| ReplayError | ✅ errors.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 05: guarded-wdk - ApprovalStore 인터페이스](step-05-approval-store-interface.md)
