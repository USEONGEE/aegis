# Step 11: guarded-wdk - middleware 마이그레이션 (InMemory → Signed broker 교체)

## 메타데이터
- **난이도**: 🔴 매우 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 09 (SignedApprovalBroker), Step 10 (factory 확장)

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/guarded-middleware.js`에서 기존 `InMemoryApprovalBroker` API 호출을 `SignedApprovalBroker` API로 교체. `approval-broker.js` 삭제 (breaking change).

### 현재 middleware 승인 흐름 (v0.0.1)

```javascript
// REQUIRE_APPROVAL 시
const ticket = await approvalBroker.request({ requestId, chain, target, ... })
const artifact = await approvalBroker.waitForApproval(ticket.id, 60000)
approvalBroker.consume(ticket.id)
```

### 새 middleware 승인 흐름 (v0.1.0)

```javascript
// REQUIRE_APPROVAL 시
const intentHash = computeIntentHash({ chain, to: tx.to, data: tx.data, value: tx.value })
const request = await approvalBroker.createRequest('tx', {
  chain,
  targetHash: intentHash,
  requestId,
  metadata: { to: tx.to, selector: tx.data?.slice?.(0, 10), value: tx.value }
})

const signedApproval = await approvalBroker.waitForApproval(requestId, 60000)
// submitApproval은 daemon이 control channel에서 수신 시 호출 (middleware 밖)
// waitForApproval이 resolve되면 검증 통과 완료
```

### 변경 포인트

1. **`approvalBroker.request()`** → **`approvalBroker.createRequest('tx', {...})`**
   - `type` 파라미터 추가
   - `targetHash` 계산 (intentHash)
   - `metadata` 구조 변경

2. **`approvalBroker.waitForApproval(ticket.id)`** → **`approvalBroker.waitForApproval(requestId)`**
   - `ticket.id` 대신 `requestId` 직접 사용

3. **`approvalBroker.consume(ticket.id)`** 제거
   - SignedApprovalBroker는 submitApproval 시 자동으로 pending 제거

4. **intentHash 계산 추가**
   - `@wdk-app/canonical`의 `intentHash` 함수 import
   - 또는 내부에서 직접 계산

5. **이벤트 변경**
   - `ApprovalGranted` → `ApprovalVerified` (signed approval 검증 통과)
   - `approver` 필드에 실제 public key

6. **새 이벤트 추가**
   - `PendingPolicyRequested`: policy 요청 생성 시
   - `ApprovalRejected`: 검증 실패 시
   - `PolicyApplied`: policy 승인 후 적용 시
   - `DeviceRevoked`: device revoke 시

7. **approval-broker.js 삭제**
   - `InMemoryApprovalBroker`는 더 이상 사용하지 않음
   - `index.js`에서 `InMemoryApprovalBroker` export 제거

### sendTransaction 수정

```javascript
account.sendTransaction = async (tx) => {
  const policies = policiesRef()
  const requestId = randomUUID()

  // intentHash 계산
  const { intentHash } = await import('@wdk-app/canonical')
  const targetHash = intentHash({ chain, to: tx.to, data: tx.data, value: String(tx.value || 0) })

  // ... 기존 IntentProposed, PolicyEvaluated 이벤트 ...

  if (decision === 'REQUIRE_APPROVAL') {
    emitter.emit('ApprovalRequested', { ... })

    await approvalBroker.createRequest('tx', {
      chain,
      targetHash,
      requestId,
      metadata: { to: tx.to, selector: tx.data?.slice?.(0, 10), value: tx.value }
    })

    const signedApproval = await approvalBroker.waitForApproval(requestId, 60000)

    emitter.emit('ApprovalVerified', {
      type: 'ApprovalVerified',
      requestId,
      approver: signedApproval.approver,
      deviceId: signedApproval.deviceId,
      timestamp: Date.now()
    })
  }

  // ... 기존 rawSendTransaction + 이벤트 ...
}
```

### transfer도 동일하게 수정

sendTransaction과 동일한 패턴 적용 (mockTx로 policy 평가 + intentHash 계산).

## 2. 완료 조건
- [ ] `guarded-middleware.js`가 `SignedApprovalBroker` API로 호출
- [ ] `createRequest('tx', {...})` 호출 시 `targetHash`로 `intentHash` 사용
- [ ] `waitForApproval(requestId, 60000)` 호출 (ticket.id 아님)
- [ ] `consume()` 호출 제거됨
- [ ] `@wdk-app/canonical`의 `intentHash` import 사용
- [ ] `approval-broker.js` 파일 삭제
- [ ] `index.js`에서 `InMemoryApprovalBroker` export 제거
- [ ] `ApprovalVerified` 이벤트 emit (기존 `ApprovalGranted` 대체)
- [ ] `ApprovalRejected` 이벤트: submitApproval 실패 시 emit 가능한 구조
- [ ] sendTransaction의 REQUIRE_APPROVAL 흐름이 SignedApprovalBroker로 동작
- [ ] transfer의 REQUIRE_APPROVAL 흐름이 SignedApprovalBroker로 동작
- [ ] AUTO 흐름은 변경 없음 (broker 호출 없음)
- [ ] REJECT 흐름은 변경 없음 (PolicyRejectionError throw)
- [ ] `npm test -- packages/guarded-wdk` — 기존 테스트는 Step 12에서 마이그레이션 (이 step에서는 broker 관련 테스트가 실패할 수 있음)

## 3. 롤백 방법
- `guarded-middleware.js`를 이전 버전으로 복원 (git checkout)
- `approval-broker.js` 복원
- `index.js`에서 `InMemoryApprovalBroker` export 복원

---

## Scope

### 삭제 대상 파일
```
packages/guarded-wdk/src/approval-broker.js   # InMemoryApprovalBroker 삭제
```

### 수정 대상 파일
```
packages/guarded-wdk/src/guarded-middleware.js  # broker 호출 API 변경 + intentHash + 이벤트
packages/guarded-wdk/src/index.js              # InMemoryApprovalBroker export 제거
```

### 신규 생성 파일
```
없음 (기존 파일 수정 + 삭제만)
```

### Side Effect 위험
- **Breaking change**: `InMemoryApprovalBroker`를 사용하는 코드가 있으면 깨짐
- **기존 테스트 실패**: `approval-broker.test.js`가 InMemoryApprovalBroker를 테스트하므로 실패 → Step 12에서 마이그레이션
- `@wdk-app/canonical` workspace 의존성 필요 (Step 08에서 이미 추가됨)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.js 수정 | design.md: broker 호출 부분만 수정 | ✅ OK |
| approval-broker.js 삭제 | design.md: InMemoryApprovalBroker → 삭제 | ✅ OK |
| index.js 수정 | InMemoryApprovalBroker export 제거 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| createRequest('tx') 호출 | ✅ guarded-middleware.js | OK |
| waitForApproval 호출 변경 | ✅ guarded-middleware.js | OK |
| consume() 제거 | ✅ guarded-middleware.js | OK |
| intentHash 계산 | ✅ guarded-middleware.js | OK |
| 이벤트 변경 (ApprovalVerified) | ✅ guarded-middleware.js | OK |
| InMemoryApprovalBroker 삭제 | ✅ approval-broker.js 삭제 | OK |
| transfer 동일 수정 | ✅ guarded-middleware.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 12: guarded-wdk - 테스트 마이그레이션](step-12-test-migration.md)
