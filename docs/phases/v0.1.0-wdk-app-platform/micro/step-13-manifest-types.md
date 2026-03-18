# Step 13: manifest - 타입 정의 + getPolicyManifest

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 03 (canonical 테스트 벡터)

---

## 1. 구현 내용 (design.md 기반)

`packages/manifest` 패키지 생성. DeFi 프로토콜 manifest 타입 정의와 `getPolicyManifest(chainId)` 규격 구현. Manifest는 policy 카탈로그 — WDK가 직접 사용하지 않고, daemon/app이 UI와 policy 변환에 사용.

### 타입 정의

```javascript
// packages/manifest/src/types.js

/**
 * @typedef {Object} Manifest
 * @property {string} protocol - 프로토콜 이름 (e.g., 'aave-v3')
 * @property {string} version - manifest 버전 (e.g., '1.0.0')
 * @property {string} description - 프로토콜 설명
 * @property {Object.<string, ChainConfig>} chains - chainId → ChainConfig
 */

/**
 * @typedef {Object} ChainConfig
 * @property {string} chainId - 체인 ID (e.g., 'ethereum', 'polygon')
 * @property {Object.<string, string>} contracts - 계약 주소 맵 (e.g., { pool: '0x...', oracle: '0x...' })
 * @property {Feature[]} features - 지원 기능 목록
 */

/**
 * @typedef {Object} Feature
 * @property {string} id - 기능 식별자 (e.g., 'supply', 'borrow', 'repay')
 * @property {string} name - 표시 이름
 * @property {string} description - 기능 설명
 * @property {Call[]} calls - 이 기능이 실행하는 컨트랙트 호출 목록
 * @property {Approval[]} approvals - 이 기능에 필요한 ERC-20 approve 호출 목록
 * @property {Constraint[]} constraints - 이 기능의 제약 조건
 */

/**
 * @typedef {Object} Call
 * @property {string} contract - 계약 참조 키 (contracts 맵의 키, e.g., 'pool')
 * @property {string} selector - 4바이트 함수 셀렉터 (e.g., '0x617ba037')
 * @property {string} signature - 함수 시그니처 (e.g., 'supply(address,uint256,address,uint16)')
 * @property {string} description - 호출 설명
 */

/**
 * @typedef {Object} Approval
 * @property {string} token - 토큰 계약 참조 키 또는 주소
 * @property {string} spender - 승인 대상 계약 참조 키 (e.g., 'pool')
 * @property {string} description - 승인 설명 (e.g., 'Approve USDC for Aave Pool')
 */

/**
 * @typedef {Object} Constraint
 * @property {string} type - 제약 유형 ('maxAmount' | 'allowedTokens' | 'allowedRecipients')
 * @property {*} value - 제약 값 (type에 따라 다름)
 * @property {string} description - 제약 설명
 */
```

### getPolicyManifest 규격

```javascript
// packages/manifest/src/index.js
import { manifests } from './manifests/index.js'

/**
 * chainId에 해당하는 모든 프로토콜 manifest를 반환
 * @param {string} chainId - 체인 식별자 (e.g., 'ethereum')
 * @returns {Manifest[]} - 해당 체인을 지원하는 manifest 목록
 */
export function getPolicyManifest(chainId) {
  return manifests
    .filter(m => m.chains[chainId] !== undefined)
    .map(m => ({
      ...m,
      chains: { [chainId]: m.chains[chainId] }  // 요청한 체인만 포함
    }))
}
```

### Aave V3 예시 manifest

```javascript
// packages/manifest/src/manifests/aave-v3.js

export const aaveV3Manifest = {
  protocol: 'aave-v3',
  version: '1.0.0',
  description: 'Aave V3 Lending Protocol',
  chains: {
    ethereum: {
      chainId: 'ethereum',
      contracts: {
        pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
        wethGateway: '0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C',
      },
      features: [
        {
          id: 'supply',
          name: 'Supply',
          description: 'Supply assets to Aave V3 pool',
          calls: [
            {
              contract: 'pool',
              selector: '0x617ba037',
              signature: 'supply(address,uint256,address,uint16)',
              description: 'Supply asset to pool',
            }
          ],
          approvals: [
            {
              token: 'asset',  // 동적 — 사용자가 선택한 토큰
              spender: 'pool',
              description: 'Approve token for Aave V3 Pool',
            }
          ],
          constraints: [
            {
              type: 'allowedTokens',
              value: ['USDC', 'USDT', 'DAI', 'WETH', 'WBTC'],
              description: 'Supported supply tokens',
            }
          ]
        },
        {
          id: 'borrow',
          name: 'Borrow',
          description: 'Borrow assets from Aave V3 pool',
          calls: [
            {
              contract: 'pool',
              selector: '0xa415bcad',
              signature: 'borrow(address,uint256,uint256,uint16,address)',
              description: 'Borrow asset from pool',
            }
          ],
          approvals: [],
          constraints: []
        },
        {
          id: 'repay',
          name: 'Repay',
          description: 'Repay borrowed assets',
          calls: [
            {
              contract: 'pool',
              selector: '0x573ade81',
              signature: 'repay(address,uint256,uint256,address)',
              description: 'Repay borrowed asset',
            }
          ],
          approvals: [
            {
              token: 'asset',
              spender: 'pool',
              description: 'Approve token for repayment',
            }
          ],
          constraints: []
        },
        {
          id: 'withdraw',
          name: 'Withdraw',
          description: 'Withdraw supplied assets',
          calls: [
            {
              contract: 'pool',
              selector: '0x69328dec',
              signature: 'withdraw(address,uint256,address)',
              description: 'Withdraw asset from pool',
            }
          ],
          approvals: [],
          constraints: []
        }
      ]
    }
  }
}
```

### 패키지 구조

```
packages/manifest/
  package.json
  src/
    index.js              # getPolicyManifest, re-exports
    types.js              # JSDoc 타입 정의
    manifests/
      index.js            # 모든 manifest를 모아서 export
      aave-v3.js          # Aave V3 manifest
  tests/
    manifest.test.js      # getPolicyManifest 테스트
```

### package.json

```json
{
  "name": "@wdk-app/manifest",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.js",
  "dependencies": {
    "@wdk-app/canonical": "workspace:*"
  }
}
```

## 2. 완료 조건
- [ ] `packages/manifest/` 디렉토리 생성
- [ ] `package.json` 생성 (`@wdk-app/manifest`, `@wdk-app/canonical` 의존성)
- [ ] `src/types.js`: Manifest, Feature, Call, Approval, Constraint 타입 정의 (JSDoc)
- [ ] `src/index.js`: `getPolicyManifest(chainId)` export
- [ ] `getPolicyManifest('ethereum')` → Aave V3 manifest 포함 배열 반환
- [ ] `getPolicyManifest('unknown')` → 빈 배열 반환
- [ ] 반환된 manifest에 요청한 chainId의 ChainConfig만 포함 (다른 체인 제외)
- [ ] `src/manifests/aave-v3.js`: Aave V3 manifest 정의 (supply, borrow, repay, withdraw)
- [ ] 각 Feature에 calls, approvals, constraints가 올바르게 정의
- [ ] Aave V3 컨트랙트 주소가 Ethereum mainnet 기준으로 정확
- [ ] `src/manifests/index.js`: 모든 manifest를 배열로 export
- [ ] `tests/manifest.test.js`: getPolicyManifest 동작 테스트
- [ ] `npm test -- packages/manifest` 통과

## 3. 롤백 방법
- `packages/manifest/` 디렉토리 삭제
- 모노레포 workspace 설정에서 `manifest` 제거

---

## Scope

### 신규 생성 파일
```
packages/manifest/package.json               # 패키지 정의
packages/manifest/src/index.js               # getPolicyManifest + re-exports
packages/manifest/src/types.js               # Manifest, Feature, Call, Approval, Constraint
packages/manifest/src/manifests/index.js     # manifest 목록
packages/manifest/src/manifests/aave-v3.js   # Aave V3 manifest
packages/manifest/tests/manifest.test.js     # 단위 테스트
```

### 수정 대상 파일
```
package.json (root)  # workspace에 packages/manifest 추가 (이미 포함되어 있을 수 있음)
```

### Side Effect 위험
- 신규 패키지 추가 — 기존 코드에 영향 없음
- `@wdk-app/canonical` workspace 의존성 (Step 01~03에서 이미 생성됨)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.js | design.md: Manifest, Feature, Call, Approval 타입 | ✅ OK |
| index.js | design.md: getPolicyManifest() 규격 | ✅ OK |
| aave-v3.js | design.md: Aave V3 example manifest | ✅ OK |
| manifest.test.js | getPolicyManifest 동작 검증 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Manifest 타입 | ✅ types.js | OK |
| Feature 타입 (calls + approvals + constraints) | ✅ types.js | OK |
| getPolicyManifest(chainId) | ✅ index.js | OK |
| Aave V3 manifest (4 features) | ✅ aave-v3.js | OK |
| chainId 필터링 | ✅ index.js | OK |
| @wdk-app/canonical 의존성 | ✅ package.json | OK |

### 검증 통과: ✅

---

→ 다음: [Step 14: manifest - manifestToPolicy 변환](step-14-manifest-to-policy.md)
