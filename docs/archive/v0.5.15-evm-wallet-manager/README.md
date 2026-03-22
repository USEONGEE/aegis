# EVM Wallet Manager - v0.5.15

## 문제 정의

### 현상
1. **StubWalletManager가 accountIndex를 무시**: `getAccount(_index)` 파라미터에 underscore가 붙어 있으며, 모든 accountIndex에 대해 동일한 stub 객체를 반환한다. BIP-44 키 파생이 전혀 이루어지지 않는다.
2. **WALLET_ADDRESS 환경변수 의존**: 지갑 주소가 master seed에서 파생되지 않고 환경변수로 주입된다. 환경변수가 없으면 `0x0000000000000000000000000000000000000000`을 반환하여 AI가 "WDK 초기화 안 됨"으로 판단한다.
3. **체인 상호작용 불가**: `sendTransaction`, `signTransaction`은 "not implemented" throw. `getBalance`는 빈 배열 `[]` 반환. 실제 EVM RPC 연결이 없다.
4. **policyPending/listCrons 로컬 destructuring 누락**: 각 case에서 args를 destructuring할 때 accountIndex를 명시적으로 추출하지 않고, 디스패처 레벨(line 286)의 외부 스코프 변수에 의존한다. 기능적으로 동작하지만 의도가 불명확하고, accountIndex 없이 호출되면 undefined가 그대로 전달된다.

### 원인
- StubWalletManager는 "프로덕션에서는 실제 EVM WalletManager를 사용해야 한다"라는 주석과 함께 임시로 만들어졌으나, 실제 구현이 이루어지지 않았다.
- BIP-44 키 파생을 위한 라이브러리(`ethers.js` 등)가 daemon 의존성에 없다.
- policyPending/listCrons는 args destructuring에서 accountIndex를 빠뜨린 코딩 실수. 외부 스코프에 동명 변수가 있어 컴파일러가 잡지 못했다.

### 영향
- **AI 에이전트가 지갑 주소를 조회할 수 없다** — getWalletAddress가 zero address 또는 env var 값을 반환
- **AI 에이전트가 토큰을 전송할 수 없다** — sendTransaction이 throw
- **AI 에이전트가 잔액을 확인할 수 없다** — getBalance가 빈 배열 반환
- **멀티 계정이 동작하지 않는다** — accountIndex가 무의미
- **데모 시나리오가 불가능** — "USDT 보내줘" 요청 시 에러 발생

### 목표
1. BIP-44 표준에 따라 master seed에서 EVM 주소와 키를 파생하는 실제 EVM Wallet Manager 구현
2. accountIndex별로 독립적인 계정 반환
3. JSON-RPC를 통한 실제 트랜잭션 서명/전송, 잔액 조회
4. WALLET_ADDRESS 환경변수 제거 (seed에서 파생)
5. policyPending/listCrons의 accountIndex를 로컬 destructuring으로 수정

### 비목표 (Out of Scope)
- 멀티 체인 지원 (현재는 HyperEVM chain 999만)
- 하드웨어 월렛 연동
- 키스토어/암호화 저장 (현재 master seed는 env var 또는 SQLite에 평문)
- EIP-1559 트랜잭션 타입 지원 (legacy tx만)
- 가스 추정 최적화
- seed 주입/온보딩 플로우 변경 (기존 MASTER_SEED env var → SQLite 저장 경로 유지)
- 도구 입력 검증 전반 강화 (이번 Phase는 policyPending/listCrons의 로컬 destructuring 수정만)

## 제약사항
- HyperEVM(chain 999)의 RPC 엔드포인트: `https://rpc.hyperliquid.xyz/evm`
- BIP-44 EVM 경로: `m/44'/60'/0'/0/{accountIndex}`
- daemon 패키지는 ESM (type: module)
- `@tetherto/wdk-wallet`의 `WalletManagerBase`를 extends해야 함
- seed provisioning은 기존 방식 유지: wdk-host.ts의 MASTER_SEED env → store.setMasterSeed → createGuardedWDK

## 배경 (이미 해결된 관련 이슈)
- **OpenClaw 플러그인 볼륨 캐싱** (v0.5.15 이전에 수정됨): entrypoint.sh의 `if [ ! -d ... ]` 조건 가드를 제거하고 매번 재설치하도록 변경 완료.
- **erc20Balances 도구** (v0.5.15 이전에 추가됨): 리스트 기반 ERC-20 잔액 배치 조회 도구 추가 완료.
- **daemon depends_on openclaw** (v0.5.15 이전에 수정됨): docker-compose.yml에 openclaw healthcheck 의존성 추가 완료.
