# 설계 - v0.5.15

## 변경 규모
**규모**: 일반 기능
**근거**: 새 의존성 추가 (@tetherto/wdk-wallet-evm), 2개+ 파일 수정 (wdk-host.ts, tool-surface.ts, docker-compose.yml), 파일 삭제 (stub-wallet-manager.ts)

---

## 문제 요약
StubWalletManager가 BIP-44 키 파생을 하지 않아 AI 에이전트가 지갑 조회/잔액 확인/트랜잭션 전송을 할 수 없다.

> 상세: [README.md](README.md) 참조

## 접근법
`@tetherto/wdk-wallet-evm`의 `WalletManagerEvm`으로 StubWalletManager를 교체한다. 이 패키지는 guarded-wdk 가이드(`packages/guarded-wdk/docs/guide/README.md`)에서 표준 경로로 문서화되어 있으며, `IWalletAccount` 인터페이스를 완전히 구현한다.

```typescript
// 변경 전 (wdk-host.ts)
import { StubWalletManager } from './stub-wallet-manager.js'
const facade = await createGuardedWDK({
  wallets: { '999': { Manager: StubWalletManager as never, config: {} } }
})

// 변경 후
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
const facade = await createGuardedWDK({
  wallets: { '999': { Manager: WalletManagerEvm, config: { provider: config.evmRpcUrl } } }
})
```

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: @tetherto/wdk-wallet-evm (공식) | IWalletAccount 완전 구현, ethers v6 내장, guarded-middleware 호환 보장 | beta(1.0.0-beta.10) | ✅ |
| B: custom EvmWalletManager + ethers | 완전 제어 가능 | IWalletAccount 전체 인터페이스 직접 구현 필요, 호환 검증 부담 | ❌ |
| C: custom + @scure/bip32 | 최소 의존성 | tx signing/RLP/keccak 직접 구현 필요, 보안 위험 | ❌ |

**선택 이유**: 공식 패키지가 존재하며 guarded-wdk 가이드에서 표준 사용 경로로 문서화되어 있다. custom 구현은 인터페이스 호환성 위험만 추가한다.

## 기술 결정

1. **라이브러리**: `@tetherto/wdk-wallet-evm@^1.0.0-beta.10` (daemon/package.json에 추가, npm workspace로 설치)
2. **config**: `{ provider: config.evmRpcUrl }` — WalletManagerEvm이 RPC를 내부적으로 처리
3. **fee**: WalletManagerEvm이 반환하는 `{ hash, fee }` 그대로 사용
4. **wdk-host.ts**: `StubWalletManager` → `WalletManagerEvm` import 교체, config에 `{ provider }` 전달
5. **stub-wallet-manager.ts**: 삭제 (더 이상 불필요)
6. **WALLET_ADDRESS 제거**: `docker-compose.yml`에서 환경변수 제거 (config.ts에는 없음, stub-wallet-manager.ts 삭제와 함께 해소)
7. **tool-surface.ts**: policyPending(line 383)/listCrons(line 450)의 accountIndex를 로컬 destructuring으로 수정

---

## 범위 / 비범위
- **범위(In Scope)**:
  - `@tetherto/wdk-wallet-evm` 의존성 추가 (daemon/package.json)
  - `wdk-host.ts`: import 교체 + config 전달
  - `stub-wallet-manager.ts`: 삭제
  - `docker-compose.yml`: WALLET_ADDRESS 환경변수 제거
  - `tool-surface.ts`: policyPending/listCrons accountIndex destructuring 수정
- **비범위(Out of Scope)**:
  - EvmWalletManager custom 구현
  - 멀티체인, EIP-1559, 가스 추정 최적화
  - tool-surface 전반 입력 검증 강화
  - seed provisioning 변경

## 아키텍처 개요

```
MASTER_SEED (env var)
  → wdk-host.ts: createGuardedWDK({
      wallets: { '999': { Manager: WalletManagerEvm, config: { provider: evmRpcUrl } } }
    })
    → WalletManagerEvm.constructor(seed, { provider })
      → BIP-39 seed buffer + ethers JsonRpcProvider 내부 생성

  → facade.getAccount('999', accountIndex)
    → WalletManagerEvm.getAccount(accountIndex)
      → BIP-44 파생: m/44'/60'/0'/0/{accountIndex}
      → IWalletAccount 반환 (getAddress, sendTransaction, getBalance 등)
    → GuardedMiddleware: policy 평가 wrapping
    → Object.freeze(account)

  → tool-surface.ts: account.sendTransaction/getBalance/getAddress
    → GuardedMiddleware: policy check (ALLOW/REJECT)
    → WalletManagerEvm 내부: ethers Wallet + JsonRpcProvider
    → HyperEVM RPC (https://rpc.hyperliquid.xyz/evm)
```

## 테스트 전략
- **타입 체크**: `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- **수동 검증**: Docker rebuild 후 AI에게 "내 지갑 주소 알려줘" → seed 기반 실제 주소 반환 확인
- **기존 테스트**: `npm test --workspace=packages/daemon` — tool-surface 관련 테스트 통과 확인

## 리스크/오픈 이슈
1. **beta 버전**: @tetherto/wdk-wallet-evm은 1.0.0-beta.10. guarded-wdk 가이드에서 사용하므로 호환성은 유지될 것.
2. **RPC 가용성**: HyperEVM RPC 다운 시 모든 체인 연산 실패 (No Fallback 원칙).
3. **타입 호환**: WalletManagerEvm이 WDKInstance 타입에 맞지 않으면 `as never` 캐스트 필요할 수 있음.
