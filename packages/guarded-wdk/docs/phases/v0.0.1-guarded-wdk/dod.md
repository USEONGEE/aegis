# DoD (Definition of Done) - v0.0.1

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `createGuardedWDK(config)`가 GuardedWDK facade를 반환한다 | unit test: facade가 getAccount, updatePolicies, on, off, dispose 메서드를 가짐 |
| F2 | `facade.getAccount(chain, index)`가 guarded account를 반환한다. 반환된 account는 `instanceof WalletAccountEvm` 통과 | integration test |
| F3 | guarded account의 `sendTransaction(tx)`가 calldata(target + selector + args)를 파싱하여 call policy permissions와 대조한다 | unit test: 허용된 tx → 실행, 미허용 tx → PolicyRejectionError |
| F4 | guarded account의 `transfer(options)`가 동일한 policy 평가를 거친다 | unit test |
| F5 | call policy permission 매칭 시 첫 번째 매치의 decision(AUTO/REQUIRE_APPROVAL/REJECT) 반환. 매치 없으면 기본 REJECT | unit test: 순서 매칭, 기본 REJECT |
| F6 | timestamp gate policy가 validAfter/validUntil 범위 밖이면 즉시 REJECT | unit test |
| F7 | 조건 연산자 8종(EQ, NEQ, GT, GTE, LT, LTE, ONE_OF, NOT_ONE_OF) 정상 동작 | unit test: 연산자별 테스트 |
| F8 | decision이 REQUIRE_APPROVAL이면 ApprovalBroker를 통해 owner 승인 대기 후 실행 | integration test: grant 후 실행 확인 |
| F9 | ApprovalBroker의 승인은 1회성. consume 후 재사용 불가 | unit test: 두 번째 consume 시 실패 |
| F10 | 승인 대기 시 timeout이면 ApprovalTimeoutError throw | unit test |
| F11 | `sign()` 호출 시 ForbiddenError throw | unit test |
| F12 | `signTypedData()` 호출 시 ForbiddenError throw | unit test |
| F13 | `keyPair` 접근 시 ForbiddenError throw | unit test |
| F14 | `dispose()` 호출 시 ForbiddenError throw | unit test |
| F15 | `approve()` 호출이 차단되지 않고, 내부 sendTransaction을 통해 policy 평가를 거친다 | integration test: 허용된 spender+amount → 통과, 미허용 spender → REJECT |
| F16 | protocol(예: Aave repay)이 내부적으로 `this._account.sendTransaction(tx)`를 호출하면 자동으로 policy guard를 거친다 | integration test: mock protocol → sendTransaction 호출 → policy 평가됨 |
| F17 | 실행 성공 시 이벤트가 순서대로 emit된다. AUTO 경로: IntentProposed → PolicyEvaluated → ExecutionBroadcasted → ExecutionSettled. REQUIRE_APPROVAL 경로: IntentProposed → PolicyEvaluated → ApprovalRequested → ApprovalGranted → ExecutionBroadcasted → ExecutionSettled | integration test: event listener로 순서 검증 |
| F18 | 실행 실패 시 ExecutionFailed 이벤트가 emit된다 | integration test |
| F19 | `updatePolicies(chain, newPolicies)`가 런타임에 policy를 교체한다. 교체 후 다음 요청부터 새 policy 적용 | integration test: updatePolicies 호출 후 이전에 REJECT되던 tx가 AUTO로 변경 |
| F20 | `updatePolicies()`는 immutable snapshot 교체. 외부에서 넘긴 객체를 이후 mutate해도 내부 policy 불변 | unit test: 외부 객체 mutation 후 policy 평가 결과 변경 없음 |
| F21 | settlement: 실행 후 `getTransactionReceipt(hash)` polling으로 receipt 확인, ExecutionSettled 이벤트 emit | integration test: mock receipt → event 확인 |
| F22 | raw WDK 인스턴스와 seed가 facade 외부에서 접근 불가 | unit test: facade 객체에 wdk, seed, _wallets 속성 없음 |
| F23 | Object.freeze 적용된 account의 메서드를 재할당/삭제 시도하면 실패 | unit test: `account.sendTransaction = () => {}` 후에도 guarded 버전 유지 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 린트 통과 | `npx standard src/guarded/` |
| N2 | 테스트 전체 통과 | `npm test` |
| N3 | 기존 WDK 모듈 코드 수정 0줄 | `git diff -- ':!src/guarded' ':!docs' ':!tests' ':!CLAUDE.md' ':!package.json' ':!package-lock.json'` 결과 없음 |
| N4 | 신규 파일 5개만 생성 | `ls src/guarded/` 결과: index.js, guarded-wdk-factory.js, guarded-middleware.js, approval-broker.js, errors.js |
| N5 | Bare runtime 호환: Bare 미지원 모듈 import 없음 | `grep -r 'node:async_hooks\|node:worker_threads\|node:vm' src/guarded/` 결과 없음 + `grep '"node:events"\|"node:crypto"' node_modules/bare-node-runtime/imports.json` 매핑 존재 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | call policy에 permissions가 빈 배열 | 모든 sendTransaction → REJECT | unit test |
| E2 | chain에 해당하는 policy가 없음 | 해당 chain의 모든 sendTransaction → REJECT | unit test |
| E3 | tx.data가 없거나 4바이트 미만 (selector 파싱 불가) | REJECT | unit test |
| E4 | tx.to가 없음 (contract creation) | REJECT (contract creation은 허용하지 않음) | unit test |
| E5 | args 조건에서 비교 값이 bigint 범위 초과 | 적절한 에러 throw | unit test |
| E6 | 동시에 두 개의 sendTransaction 호출 | 각각 독립적으로 policy 평가, 서로 간섭 없음 | integration test: Promise.all |
| E7 | REQUIRE_APPROVAL 대기 중 두 번째 요청 | 각각 독립적으로 승인 대기 | integration test |
| E8 | updatePolicies 호출과 동시에 sendTransaction 호출 | in-flight 요청은 호출 시점의 snapshot 사용 | integration test |
| E9 | USDT mainnet approve: 기존 allowance > 0 상태에서 새 approve | WalletAccountEvm의 기존 USDT 로직 그대로 동작 (에러 throw) | integration test (mock) |
| E10 | malformed policy (잘못된 type, 미지원 연산자, 누락된 필드) | updatePolicies 시 즉시 validation error throw | unit test |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| GuardedAccount 제공, AI는 이 인터페이스만 사용 | F1, F2, F22, F23 |
| 모든 intent는 policy engine을 거침 | F3, F4, F5, F6, F7 |
| REQUIRE_APPROVAL 시 owner 1회성 승인 | F8, F9, F10 |
| 모든 실행은 구조화된 이벤트로 보고 | F17, F18, F21 |
| 기존 WDK 모듈 수정 없이 decorator + middleware | N3, N4 |
| sign/signTypedData/keyPair 차단 | F11, F12, F13 |
| approve는 policy가 검증 | F15 |
| protocol 호출도 자동 guard | F16 |
| 런타임 policy 교체 | F19, F20 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| Contract level policy (target + selector + args) | F3, F5, F7 |
| Timestamp gate policy | F6 |
| approve() 차단 안 함, policy가 spender+amount 검증 | F15 |
| Protocol wrapping 없음 | F16 |
| AsyncLocalStorage/bypass 없음 | E6 (동시성 독립 동작) |
| Node.js EventEmitter 내장 사용 | F17, F18 |
| Object.freeze | F23 |
| Immutable snapshot 교체 | F20, E8 |
| 5파일 구조 | N4 |
| Node.js + Bare 지원 가능 | N5 |
| malformed policy 즉시 실패 (No Fallback) | E10 |
