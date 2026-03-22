# No Optional 원칙 전면 적용 - v0.4.0

## 문제 정의

### 현상
프로젝트 설계 원칙 "No Optional: 선택적 필드/파라미터를 만들지 않는다. 필요하면 별도 타입으로 분리한다"가 7개 패키지에 걸쳐 **64건** 위반되고 있다.

전수조사 결과 (총 ~143개 optional 중):
- 정당한 사용: 79건 (55%) — 외부 라이브러리 호환, 쿼리 필터, 설정 기본값 등
- **위반: 64건 (45%)** — discriminated union 미적용, wide bag, optional deps 등

패키지별 위반 분포:

| 패키지 | 위반 건수 |
|--------|----------|
| guarded-wdk | 16 |
| protocol | 12 |
| daemon | 12 |
| relay | 12 |
| app | 10 |
| canonical | 1 |
| manifest | 1 |

### 정당/위반 분류 규칙

optional이 **정당**한 경우:
- **외부 라이브러리 호환**: OpenAI SDK, @tetherto/wdk, Google OAuth 등 외부 타입과의 인터페이스 호환이 필요한 경우
- **쿼리 필터 옵션**: "있으면 필터, 없으면 전체" 의미론이 명확한 경우 (예: `HistoryQueryOpts.limit?`)
- **설정 기본값 (constructor/factory)**: 생성 시 생략하면 내부에서 기본값을 적용하는 config 객체 (예: `RedisQueueOptions.url?`, `RateLimitOptions.max?`)
- **React 컴포넌트 boolean props**: UI 스타일링 플래그 (예: `InfoRow.mono?`)
- **Error 서브클래스 추가 상세**: 관용적 optional detail (예: `SignatureError.detail?`)

optional이 **위반**인 경우:
- **Wide Bag**: 서로 다른 상태/종류를 하나의 타입에 합침 → discriminated union으로 분리 가능
- **DU 미적용**: 타입 필드(type, ok 등)로 구분 가능한데 단일 interface에 모든 필드를 optional로 선언
- **Default 대신 Optional**: 호출자가 제공하는 값이 아니라, 내부 로직의 기본값을 optional로 표현 (config가 아닌 도메인 필드)
- **Required + null 대신 Optional**: 의미론적으로 "값이 없을 수 있음"인데 `T?` 대신 `T | null`(required)로 표현해야 하는 경우
- **Optional Deps**: 함수 파라미터에 optional 의존성 → null check 분기 산재
- **보안 필드**: 보안상 필수인 값을 optional로 선언

핵심 구분: **"설정 기본값(config)"과 "도메인 필드 기본값"은 다르다.** `config.maxRetries?`는 정당하지만, `ChainArgs.accountIndex?`는 도메인 값이므로 위반.

### 원인
6가지 위반 패턴이 식별됨:

1. **Wide Bag (22건)**: 서로 다른 상태/종류를 하나의 타입에 합치고 optional로 처리. `ControlResult`, `RelayEnvelope`, `QueuedMessage`, `AdminRequest/Response` 등.

2. **Discriminated Union 미적용 (15건)**: 타입 필드로 구분 가능한데 interface에 모든 필드를 optional로 선언. `HistoryEntry`, `PendingApprovalRequest`, `CancelResult`, `ValidationResult` 등.

3. **Default 대신 Optional (8건)**: 기본값이 있는 필드를 optional로 선언. `GuardedWDKConfig.wallets/protocols`, `ChainArgs.accountIndex`, `IntentInput.value` 등.

4. **Required + null 대신 Optional (8건)**: `T | null`이어야 할 것을 `T?`로 표현. `PairedSigner.name`, `ActivityEvent.details`, `Policy.constraints` 등.

5. **Optional Deps 전달 (6건)**: 함수 파라미터에 optional로 의존성을 받아 내부에서 null check 분기 산재. `handleControlMessage(relayClient?, approvalStore?, queueManager?)` 등.

6. **보안 필드 Optional (3건)**: 보안상 필수인 필드를 optional로 선언. `forTx.policyVersion`, `connect.authToken` 등.

근본 원인:
- 28개 Phase의 리팩토링이 **패키지 경계**(의존 방향, export 정리)에 집중되어, 패키지 **내부** 타입 필드 수준의 정리는 미진행
- v0.1.0의 44 micro steps에서 초기 타입이 wide bag으로 시작된 것이 그대로 잔존
- Wire protocol 타입(`RelayEnvelope`, `ControlResult`)과 내부 타입의 혼용

### 영향
1. **타입 안전성 저하**: optional 필드에 대한 null check가 코드 전반에 산재. 런타임 오류 가능성.
2. **설계 원칙 위반**: 프로젝트의 4대 설계 원칙 중 하나를 45% 위반. 원칙의 실효성 훼손.
3. **보안 리스크**: `policyVersion`, `authToken` 같은 보안 필수 필드가 optional이면 검증 누락 가능.
4. **가독성 저하**: wide bag 타입은 "이 필드가 이 상황에서 있는지 없는지"를 코드를 읽어야 판단 가능.

### 목표
- 64건의 No Optional 위반을 **전수 수정**
- 각 위반을 패턴에 맞는 적절한 방법으로 해소:
  - Wide Bag / DU 미적용 → discriminated union 분리
  - Default 대신 Optional → required + 기본값 적용
  - Required + null 대신 Optional → `T | null` required로 변경
  - Optional Deps → 의존성 주입 패턴 또는 필수 파라미터로 변경
  - 보안 필드 → required로 변경
- 수정 후 모든 패키지의 tsc, 테스트 통과

### 비목표 (Out of Scope)
- 정당한 optional 79건은 건드리지 않음 (위 분류 규칙 참조)
- 새로운 기능 추가 없음
- 파일 분할/리네이밍 등 구조적 리팩토링은 이번 Phase 범위 밖 (타입 시그니처 변경 + 그에 따른 런타임 코드 수정)
- 대규모 신규 테스트 추가 없음. 단, **기존 테스트의 회귀 보강 및 fixture 수정은 허용**

## 제약사항
- Breaking change 허용 (v0.4.0 minor bump). 이 버전은 내부 phase 버전이며, 모노레포 내 원샷 변경이므로 외부 호환성 고려 불요.
- **Wire protocol 변경 정책**: `ControlResult`, `RelayEnvelope` 등 패키지 경계 타입도 monorepo 원샷 변경 허용. 모든 producer/consumer가 동일 레포 내에 있으므로, 타입 변경 시 양쪽을 동시에 수정.
- 패키지 간 의존 방향 변경 없음 (현재 단방향 유지)
- 7개 패키지를 한 Phase에서 처리하므로, 의존 방향 순서대로 수정 (leaf → root: canonical/protocol → guarded-wdk → manifest → daemon → relay → app)

## 위반 목록 (Source of Truth)

Step 4 (Tickets)에서 각 위반을 티켓으로 분할할 때, 아래 목록을 기준으로 커버리지를 검증한다.

### canonical (1건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 1 | index.ts:22 | IntentInput | value? | Default 대신 Optional |

### protocol (12건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 2 | control.ts:51 | ControlResult | type? | Wide Bag |
| 3 | control.ts:52 | ControlResult | requestId? | Wide Bag |
| 4 | control.ts:53 | ControlResult | messageId? | Wide Bag |
| 5 | control.ts:54 | ControlResult | error? | Wide Bag |
| 6 | control.ts:55 | ControlResult | reason? | Wide Bag |
| 7 | control.ts:56 | ControlResult | wasProcessing? | Wide Bag |
| 8 | relay.ts:16 | RelayEnvelope | payload? | Wide Bag |
| 9 | relay.ts:17 | RelayEnvelope | encrypted? | Wide Bag |
| 10 | relay.ts:18 | RelayEnvelope | sessionId? | Wide Bag |
| 11 | relay.ts:19 | RelayEnvelope | userId? | Wide Bag |
| 12 | relay.ts:20 | RelayEnvelope | daemonId? | Wide Bag |
| 13 | relay.ts:21 | RelayEnvelope | userIds? | Wide Bag |

### guarded-wdk (16건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 14 | approval-verifier.ts:14 | VerificationContext | currentPolicyVersion? | Wide Bag |
| 15 | approval-verifier.ts:15 | VerificationContext | expectedTargetHash? | Wide Bag |
| 16 | approval-store.ts:65 | PendingApprovalRequest | walletName? | DU 미적용 |
| 17 | approval-store.ts:72 | HistoryEntry | requestId? | DU 미적용 |
| 18 | approval-store.ts:78 | HistoryEntry | content? | DU 미적용 |
| 19 | approval-store.ts:79 | HistoryEntry | signedApproval? | DU 미적용 |
| 20 | approval-store.ts:203 | ApprovalStore.saveSigner | _name? | Required+null |
| 21 | approval-store.ts:225 | ApprovalStore.updateJournalStatus | _txHash? | DU 미적용 |
| 22 | guarded-wdk-factory.ts:26 | GuardedWDKConfig | wallets? | Default 대신 Optional |
| 23 | guarded-wdk-factory.ts:27 | GuardedWDKConfig | protocols? | Default 대신 Optional |
| 24 | guarded-wdk-factory.ts:28 | GuardedWDKConfig | approvalBroker? | DU 미적용 |
| 25 | guarded-wdk-factory.ts:30 | GuardedWDKConfig | trustedApprovers? | DU 미적용 |
| 26 | guarded-wdk-factory.ts:34 | GuardedWDKFacade.getAccount | index? | Default 대신 Optional |
| 27 | signed-approval-broker.ts:11 | CreateRequestOptions | requestId? | DU 미적용 |
| 28 | signed-approval-broker.ts:14 | CreateRequestOptions | walletName? | DU 미적용 |
| 29 | signed-approval-broker.ts:34 | SignedApprovalBroker constructor | emitter? | Optional Deps |

### manifest (1건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 30 | types.ts:77 | ValidationResult | errors? | DU 미적용 |

### daemon (12건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 31 | message-queue.ts:9 | QueuedMessage | chainId? | Wide Bag |
| 32 | message-queue.ts:11 | QueuedMessage | cronId? | Wide Bag |
| 33 | message-queue.ts:17 | CancelResult | reason? | DU 미적용 |
| 34 | message-queue.ts:18 | CancelResult | wasProcessing? | DU 미적용 |
| 35 | control-handler.ts:51 | handleControlMessage | relayClient? | Optional Deps |
| 36 | control-handler.ts:52 | handleControlMessage | approvalStore? | Optional Deps |
| 37 | control-handler.ts:53 | handleControlMessage | queueManager? | Optional Deps |
| 38 | tool-surface.ts:199 | ChainArgs | accountIndex? | Default 대신 Optional |
| 39 | tool-surface.ts:219 | CronIdArgs | accountIndex? | Default 대신 Optional |
| 40 | execution-journal.ts:13 | JournalEntry | chainId? | Wide Bag |
| 41 | execution-journal.ts:14 | JournalEntry | txHash? | DU 미적용 |
| 42 | admin-server.ts:29-38 | AdminRequest/AdminResponse | status?, chainId?, limit?, data?, error? | Wide Bag |

### relay (12건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 43 | routes/auth.ts:78 | PairBody | pushToken? | Wide Bag |
| 44 | routes/auth.ts:106 | JwtPayload | deviceId? | Wide Bag |
| 45 | routes/auth.ts:135 | signAppToken | deviceId? | Wide Bag |
| 46 | routes/auth.ts:561 | POST /auth/google body | deviceId? | Wide Bag |
| 47 | routes/ws.ts:27-36 | IncomingMessage/OutgoingMessage | payload?, id?, message? | Wide Bag |
| 48 | routes/push.ts:10-11 | PushResult | ticketId?, error? | DU 미적용 |
| 49 | registry/registry-adapter.ts:7 | UserRecord | passwordHash? | Wide Bag |
| 50 | registry/registry-adapter.ts:15 | DeviceRecord | pushToken? | Wide Bag |
| 51 | registry/registry-adapter.ts:30 | SessionRecord | metadata? | Required+null |
| 52 | registry/registry-adapter.ts:42 | CreateUserParams | passwordHash? | Wide Bag |
| 53 | registry/registry-adapter.ts:49 | RegisterDeviceParams | pushToken? | Wide Bag |
| 54 | registry/registry-adapter.ts:55 | CreateSessionParams | metadata? | Required+null |

### app (10건)
| # | 파일 | 타입/심볼 | optional 필드 | 패턴 |
|---|------|----------|---------------|------|
| 55 | stores/usePolicyStore.ts:15 | Policy | constraints? | Required+null |
| 56 | stores/usePolicyStore.ts:16 | Policy | description? | Required+null |
| 57 | stores/useActivityStore.ts:24 | ActivityEvent | chainId? | Wide Bag |
| 58 | stores/useActivityStore.ts:26 | ActivityEvent | details? | Required+null |
| 59 | core/approval/SignedApprovalBuilder.ts:121 | forTx params | policyVersion? | 보안 필드 |
| 60 | core/approval/SignedApprovalBuilder.ts:225 | build params | policyVersion? | 보안 필드 |
| 61 | core/crypto/E2ECrypto.ts:24 | EncryptedMessage | ephemeralPubKey? | DU 미적용 |
| 62 | core/relay/RelayClient.ts:26 | RelayMessage | sessionId? | Wide Bag |
| 63 | core/relay/RelayClient.ts:32-33 | ControlEnvelope | messageId?, timestamp? | Required+null |
| 64 | core/relay/RelayClient.ts:154 | connect | authToken? | 보안 필드 |
