# Step 10: guarded-wdk - factory 확장 (ApprovalStore + trustedApprovers)

## 메타데이터
- **난이도**: 🟠 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 06 또는 Step 07 (ApprovalStore 구현 1개 이상), Step 09 (SignedApprovalBroker)

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/guarded-wdk-factory.js` 확장. `createGuardedWDK(config)`에 `approvalStore`와 `trustedApprovers` 파라미터를 추가하고, `SignedApprovalBroker`를 내부에서 생성.

### config 변경 (breaking change)

```javascript
// 기존 (v0.0.1)
createGuardedWDK({
  seed, wallets, protocols, policies,
  approvalBroker  // InMemoryApprovalBroker 인스턴스
})

// 신규 (v0.1.0)
createGuardedWDK({
  seed, wallets, protocols, policies,
  approvalBroker,     // SignedApprovalBroker 인스턴스 (외부에서 주입)
  approvalStore,      // ApprovalStore 인스턴스 (optional, broker에서도 참조)
  trustedApprovers    // string[] — trusted public keys (optional, broker에서도 참조)
})
```

### 변경 사항

1. **approvalBroker 타입 변경**: `InMemoryApprovalBroker` → `SignedApprovalBroker` (또는 호환 인터페이스)
2. **approvalStore 참조**: factory가 store를 알아야 하는 이유:
   - `updatePolicies()` 호출 시 store에도 반영
   - factory dispose 시 store 정리 가능
3. **trustedApprovers 참조**: factory가 trustedApprovers를 알아야 하는 이유:
   - daemon에서 device pairing 시 동적 추가 가능
4. **updatePolicies 확장**: 기존은 in-memory만 변경 → store가 있으면 `store.savePolicy`도 호출
5. **새 메서드 노출**:
   - `getApprovalBroker()` — broker 참조 반환 (daemon이 submitApproval 호출용)
   - `getApprovalStore()` — store 참조 반환 (daemon이 직접 store 접근용)

### 초기화 흐름

```javascript
export function createGuardedWDK(config) {
  const {
    seed, wallets, protocols, policies,
    approvalBroker, approvalStore, trustedApprovers
  } = config

  // broker가 없으면 에러 (v0.1.0에서는 필수)
  // 단, 하위호환을 위해 InMemoryApprovalBroker도 허용하되 deprecated 경고
  // → "No Backward Compatibility" 원칙에 따라 InMemoryApprovalBroker 미허용으로 변경 가능

  // ... 기존 WDK 초기화 ...

  // updatePolicies 확장
  updatePolicies(chain, newPolicies) {
    // 기존: in-memory policiesStore 업데이트
    // 추가: store가 있으면 store.savePolicy도 호출
  }

  return {
    // 기존 메서드들 ...
    getApprovalBroker() { return approvalBroker },
    getApprovalStore() { return approvalStore },
  }
}
```

### daemon 사용 패턴

```javascript
import { createGuardedWDK, SignedApprovalBroker, SqliteApprovalStore } from '@wdk-app/guarded-wdk'

const store = new SqliteApprovalStore('~/.wdk/store/wdk.db')
const broker = new SignedApprovalBroker(trustedApprovers, store)
const wdk = createGuardedWDK({
  seed, wallets, protocols,
  policies: {},
  approvalBroker: broker,
  approvalStore: store,
  trustedApprovers
})
```

## 2. 완료 조건
- [ ] `guarded-wdk-factory.js`가 `approvalStore` 파라미터를 받음
- [ ] `guarded-wdk-factory.js`가 `trustedApprovers` 파라미터를 받음
- [ ] `approvalBroker`가 `SignedApprovalBroker` 인스턴스일 때 정상 동작
- [ ] `approvalBroker` 미전달 시 명확한 에러 메시지
- [ ] `updatePolicies(chain, newPolicies)`가 store 있을 때 `store.savePolicy` 호출
- [ ] `updatePolicies(chain, newPolicies)`가 store 없을 때 기존과 동일 (in-memory만)
- [ ] `getApprovalBroker()` 메서드가 broker 인스턴스 반환
- [ ] `getApprovalStore()` 메서드가 store 인스턴스 반환 (없으면 undefined)
- [ ] `dispose()` 호출 시 기존 wdk.dispose() + store?.dispose?.() 호출
- [ ] 기존 `createGuardedWDK` 시그니처와 호환 (새 파라미터는 optional)
- [ ] `npm test -- packages/guarded-wdk` 통과

## 3. 롤백 방법
- `guarded-wdk-factory.js`에서 추가된 로직 제거
- `approvalStore`, `trustedApprovers` 파라미터 처리 제거
- `getApprovalBroker`, `getApprovalStore` 메서드 제거

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/tests/factory-extension.test.js  # factory 확장 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/guarded-wdk-factory.js  # approvalStore, trustedApprovers, 새 메서드
packages/guarded-wdk/src/index.js                # 변경 없을 수 있음 (이미 createGuardedWDK export)
```

### Side Effect 위험
- `guarded-wdk-factory.js` 수정 — 기존 `createGuardedWDK` 호출에 새 파라미터가 optional이므로 기존 테스트 영향 없음
- `updatePolicies`에 store 쓰기 추가 — store가 없으면 기존 동작 유지
- `dispose()` 변경 — store.dispose() 추가 (store가 없으면 기존 동작)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-wdk-factory.js 수정 | design.md: factory에 ApprovalStore, trustedApprovers 추가 | ✅ OK |
| factory-extension.test.js | factory 확장 동작 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| approvalStore 파라미터 | ✅ guarded-wdk-factory.js | OK |
| trustedApprovers 파라미터 | ✅ guarded-wdk-factory.js | OK |
| updatePolicies store 연동 | ✅ guarded-wdk-factory.js | OK |
| getApprovalBroker/getApprovalStore | ✅ guarded-wdk-factory.js | OK |
| dispose store 정리 | ✅ guarded-wdk-factory.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 11: guarded-wdk - middleware 마이그레이션](step-11-middleware-migration.md)
