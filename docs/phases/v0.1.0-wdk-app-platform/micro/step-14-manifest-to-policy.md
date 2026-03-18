# Step 14: manifest - manifestToPolicy 변환

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 13 (manifest 타입 정의 + getPolicyManifest)

---

## 1. 구현 내용 (design.md 기반)

`packages/manifest/src/manifest-to-policy.js`에 `manifestToPolicy(manifest, chainId, userConfig)` 구현. Manifest의 Feature 정의를 WDK call policy permissions으로 변환. Feature의 `approvals` 필드에서 ERC-20 approve permission을 자동 생성.

### manifestToPolicy 함수

```javascript
// packages/manifest/src/manifest-to-policy.js
import { canonicalJSON } from '@wdk-app/canonical'

/**
 * Manifest → WDK call policy 변환
 * @param {Manifest} manifest - 프로토콜 manifest
 * @param {string} chainId - 대상 체인
 * @param {Object} userConfig - 사용자 설정
 * @param {string[]} [userConfig.features] - 활성화할 feature ID 목록 (미지정 시 전체)
 * @param {Object} [userConfig.tokenAddresses] - 토큰 심볼 → 주소 맵 (e.g., { USDC: '0x...' })
 * @param {string} [userConfig.userAddress] - 사용자 지갑 주소 (onBehalfOf 등)
 * @returns {Object[]} - WDK policy permissions 배열
 */
export function manifestToPolicy(manifest, chainId, userConfig = {}) {
  const chainConfig = manifest.chains[chainId]
  if (!chainConfig) return []

  const { features: enabledFeatures, tokenAddresses = {}, userAddress } = userConfig
  const selectedFeatures = enabledFeatures
    ? chainConfig.features.filter(f => enabledFeatures.includes(f.id))
    : chainConfig.features

  const permissions = []

  for (const feature of selectedFeatures) {
    // 1. Feature calls → call policy permissions
    for (const call of feature.calls) {
      const contractAddress = chainConfig.contracts[call.contract]
      permissions.push({
        type: 'call',
        address: contractAddress,
        selector: call.selector,
        description: `${manifest.protocol}/${feature.id}: ${call.description}`,
      })
    }

    // 2. Feature approvals → ERC-20 approve permissions (자동 생성)
    for (const approval of feature.approvals) {
      const spenderAddress = chainConfig.contracts[approval.spender]
      permissions.push({
        type: 'call',
        address: '*',  // 토큰 주소는 동적 (사용 시점에 결정)
        selector: '0x095ea7b3',  // approve(address,uint256)
        description: `${manifest.protocol}/${feature.id}: ${approval.description}`,
        constraints: {
          spender: spenderAddress,
        },
      })
    }
  }

  return permissions
}
```

### ERC-20 approve 자동 생성 로직

Feature에 `approvals` 배열이 있으면, 각 항목에 대해 `approve(address,uint256)` selector(`0x095ea7b3`)를 가진 permission을 자동 생성. spender는 manifest의 contracts 맵에서 해석.

```javascript
// 예: Aave V3 supply feature
feature.approvals = [{
  token: 'asset',           // 동적 토큰
  spender: 'pool',          // contracts.pool → 0x87870Bca3...
  description: 'Approve token for Aave V3 Pool'
}]

// 생성되는 permission:
{
  type: 'call',
  address: '*',                // 토큰 주소는 동적
  selector: '0x095ea7b3',     // approve(address,uint256)
  description: 'aave-v3/supply: Approve token for Aave V3 Pool',
  constraints: {
    spender: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  }
}
```

### Aave manifest → policy 변환 예시

```javascript
import { getPolicyManifest } from '@wdk-app/manifest'
import { manifestToPolicy } from '@wdk-app/manifest'

const [aaveManifest] = getPolicyManifest('ethereum')
  .filter(m => m.protocol === 'aave-v3')

const permissions = manifestToPolicy(aaveManifest, 'ethereum', {
  features: ['supply', 'repay'],
})

// 결과:
// [
//   { type: 'call', address: '0x87870Bca3...', selector: '0x617ba037', description: 'aave-v3/supply: Supply asset to pool' },
//   { type: 'call', address: '*', selector: '0x095ea7b3', description: 'aave-v3/supply: Approve token for Aave V3 Pool', constraints: { spender: '0x87870Bca3...' } },
//   { type: 'call', address: '0x87870Bca3...', selector: '0x573ade81', description: 'aave-v3/repay: Repay borrowed asset' },
//   { type: 'call', address: '*', selector: '0x095ea7b3', description: 'aave-v3/repay: Approve token for repayment', constraints: { spender: '0x87870Bca3...' } },
// ]
```

### evaluatePolicy 연동 테스트

생성된 policy를 WDK의 `evaluatePolicy`에 전달하여 실제 tx가 AUTO/REQUIRE_APPROVAL/REJECT로 분류되는지 검증.

```javascript
import { evaluatePolicy } from '@wdk-app/guarded-wdk'

const policies = {
  ethereum: {
    defaultAction: 'REQUIRE_APPROVAL',
    rules: permissions.map(p => ({
      ...p,
      action: 'AUTO',
    }))
  }
}

// Aave supply tx → AUTO (manifest에 정의된 selector + address)
const supplyTx = { to: '0x87870Bca3...', data: '0x617ba037...', value: '0' }
const result = evaluatePolicy(policies.ethereum, supplyTx)
// result === 'AUTO'

// 정의되지 않은 tx → REQUIRE_APPROVAL (defaultAction)
const unknownTx = { to: '0xDEAD...', data: '0x12345678...', value: '0' }
const result2 = evaluatePolicy(policies.ethereum, unknownTx)
// result2 === 'REQUIRE_APPROVAL'
```

## 2. 완료 조건
- [ ] `packages/manifest/src/manifest-to-policy.js` 파일 생성
- [ ] `manifestToPolicy(manifest, chainId, userConfig)` export
- [ ] Feature의 calls → call policy permissions 변환
- [ ] Feature의 approvals → ERC-20 approve permission 자동 생성 (`selector: 0x095ea7b3`)
- [ ] approve permission에 spender constraint 포함
- [ ] contracts 맵에서 주소 해석 (참조 키 → 실제 주소)
- [ ] `userConfig.features`로 특정 feature만 선택 가능
- [ ] `userConfig.features` 미지정 시 전체 feature 변환
- [ ] 존재하지 않는 chainId → 빈 배열 반환
- [ ] `src/index.js`에서 `manifestToPolicy` re-export
- [ ] 테스트: Aave V3 manifest → policy 변환 정확성
- [ ] 테스트: 생성된 policy로 `evaluatePolicy` 호출 → AUTO/REQUIRE_APPROVAL 분류 확인
- [ ] 테스트: feature 선택 필터링 동작
- [ ] 테스트: approvals가 없는 feature → approve permission 미생성
- [ ] `npm test -- packages/manifest` 통과

## 3. 롤백 방법
- `packages/manifest/src/manifest-to-policy.js` 삭제
- `src/index.js`에서 `manifestToPolicy` re-export 제거
- 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/manifest/src/manifest-to-policy.js               # manifestToPolicy 변환 로직
packages/manifest/tests/manifest-to-policy.test.js         # 변환 + evaluatePolicy 연동 테스트
```

### 수정 대상 파일
```
packages/manifest/src/index.js  # manifestToPolicy re-export 추가
```

### Side Effect 위험
- 없음 (신규 파일 + export 추가만)
- `@wdk-app/canonical` 의존성은 Step 13에서 이미 추가됨
- `@wdk-app/guarded-wdk`는 테스트에서만 import (evaluatePolicy 연동 검증)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| manifest-to-policy.js | design.md: manifest → WDK policy 변환 | ✅ OK |
| manifest-to-policy.test.js | 변환 정확성 + evaluatePolicy 연동 | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| manifestToPolicy 함수 | ✅ manifest-to-policy.js | OK |
| Feature calls → permissions | ✅ manifest-to-policy.js | OK |
| Feature approvals → approve permissions (자동 생성) | ✅ manifest-to-policy.js | OK |
| contracts 주소 해석 | ✅ manifest-to-policy.js | OK |
| userConfig.features 필터링 | ✅ manifest-to-policy.js | OK |
| evaluatePolicy 연동 테스트 | ✅ manifest-to-policy.test.js | OK |
| Aave V3 변환 테스트 | ✅ manifest-to-policy.test.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 15: daemon - 프로젝트 셋업](step-15-daemon-setup.md)
