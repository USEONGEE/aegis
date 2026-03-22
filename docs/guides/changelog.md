# Changelog

## v0.4.9 - 도메인 모델 Null 제거 (2026-03-22)

- **EvaluationResult 3-variant DU**: `context: EvaluationContext | null` + `matchedPermission: Rule | null` 동시 해소. AllowResult / SimpleRejectResult / DetailedRejectResult로 분리. protocol wire 타입도 DU 전환
- **ChainScope DU**: `chainId: number | null` → `{ kind: 'specific'; chainId: number } | { kind: 'all' }`. Cron, QueuedMessage에 적용
- **SignerStatus DU**: `revokedAt: number | null` → `{ kind: 'active' } | { kind: 'revoked'; revokedAt: number }`
- **VerificationTarget DU**: `expectedTargetHash: string | null` → `verify_hash | skip_hash`. `currentPolicyVersion` dead field 삭제
- **ApprovalRequest DU**: App `targetPublicKey: string | null` → device_revoke variant 전용
- **Filter 객체 전환**: `loadPendingApprovals(null, null, null)` → `loadPendingApprovals({})`. `listCrons(null)` → `listCrons({})`
- **기본값 확정**: `walletName`, `StoredSigner.name` → non-null string. NullLogger 패턴 도입
- 📝 [Phase 문서](../archive/v0.4.9-domain-null-cleanup/README.md)

### 수치
- 4패키지 tsc 0 errors, 221/222 tests pass (1건 pre-existing)
- 31 files changed, +422/-329

## v0.4.8 - WS 채널 재설계 + Protocol 타입 강제 적용 (2026-03-22)

- **채널 단방향 통일**: control을 app→daemon 단방향으로 전환. cancel 결과(CancelCompleted/CancelFailed)를 event_stream으로 이동하여 control/event_stream 방향 일관성 확보
- **단일 전달 경로**: 영속 채널(chat, control, event_stream)의 직접 forward 제거. Redis XADD → poller XREAD 단일 경로로 통일하여 메시지 중복 수신 해소
- **query/query_result 채널 신설**: app이 daemon에게 데이터를 직접 조회할 수 있는 WS 전용 채널. policyList, pendingApprovals, signerList, walletList 4종 초기 지원. Redis 미경유(영속 불필요)
- **protocol 타입 강제 적용**: daemon/relay/app 모든 메시지 송수신에서 protocol 패키지 타입 import + 적용. 리터럴 직접 작성 제거. 컴파일 타임 체크 확보
- **DaemonStore query 인터페이스 확장**: listPolicies, listPendingApprovals, listSigners, listWallets 4종 조회 메서드를 DaemonStore + ports에 추가
- 📝 [Phase 문서](../archive/v0.4.8-ws-channel-protocol-enforcement/README.md)

### 수치
- daemon 4 suite / 169 tests pass, protocol + daemon tsc clean
- 28 files changed, +632 -1,206

## v0.4.4 - App WDK 이벤트 마이그레이션 (2026-03-22)

- **sendApproval() WDK 이벤트 전환**: ControlResult 대기 → event_stream 기반. 6종 승인 타입별 성공 이벤트 매핑 (tx→ExecutionBroadcasted, policy→PolicyApplied, revoke→SignerRevoked, wallet→WalletCreated/Deleted). ApprovalFailed로 실패 처리.
- **eventName → event.type 마이그레이션**: DashboardScreen, SettingsScreen에서 v0.4.2 호환성 복원
- **Activity Store 이벤트 적재**: RootNavigator syncHandler에서 event_stream → useActivityStore.addEvent(). ActivityEventType에 ApprovalFailed + 4종 추가
- **Identity 이벤트에 requestId 추가**: SignerRevoked, WalletCreated, WalletDeleted에 requestId 필드 추가 (protocol + broker)
- 📝 [Phase 문서](../archive/v0.4.4-app-wdk-event-migration/README.md)

### 수치
- tsc: protocol + guarded-wdk + daemon + app 모두 통과
- 5 files changed (app) + 2 files changed (protocol/guarded-wdk requestId 보완)

## v0.4.2 - WDK 이벤트 단일화 + 타입 규격화 (2026-03-22)

- **Dual Emitter 버그 수정**: daemon이 자체 emitter/broker 생성하던 것을 제거. factory 단독 소유로 통일. broker 이벤트가 wdk.on()에 정상 도달.
- **14종 WDK 이벤트 타입 시스템**: protocol/src/events.ts에 WDKEventBase + 14종 개별 타입 + AnyWDKEvent union 정의
- **원자적 이벤트 발행**: submitApproval() 리팩토링 — 도메인 처리 완료 후 best-effort emit. 실패 시 ApprovalFailed만 발행.
- **Broker에 후처리 내재화**: savePolicy, setTrustedApprovers를 broker 내부로 이동. ApprovalSubmitContext discriminated union 도입.
- **Control-Handler 단순화**: store 직접 접근 제거. 승인 6종 null 반환 (WDK 이벤트 대체). cancel 2종 ControlResult 유지.
- **EventStreamEvent 정리**: eventName 제거, event.type이 source of truth. AnyWDKEvent 타입 적용.
- 📝 [Phase 문서](../archive/v0.4.2-wdk-event-unification/README.md)

### 수치
- daemon jest: 65/65 passed
- tsc: protocol + guarded-wdk + daemon 모두 통과
- 10 files changed, ~900 lines modified

## v0.4.1 - Strict CI Checks (2026-03-22)

- **no-empty-catch 체크 신규**: CatchClause AST → Block.getStatements().length === 0 판별. 주석만 있는 catch도 위반 (11→0)
- **no-console 체크 신규**: CallExpression → console.* PropertyAccessExpression 판별. 전체 7개 패키지 대상 (19→0)
- **no-explicit-any 체크 신규**: AnyKeyword SyntaxKind 판별 + 부모 컨텍스트별 메시지 (as any / catch :any / parameter :any / variable :any / type expression). daemon/relay/app/manifest 4개 패키지 대상 (91→0)
- **shared/ast-source-files.ts**: ts-morph Project 기반 first-party 소스 파일 수집 유틸. .tsx 포함, tests/dist/node_modules 제외
- **ProcessResult 타입 도입**: message-queue의 MessageProcessor가 void → ProcessResult 반환. empty catch 대신 명시적 성공/실패 값
- **QueueLogger 인터페이스**: message-queue에 구조화 로거 주입. process.stderr 직출력 제거
- 📝 [Phase 문서](../archive/v0.4.1-strict-ci-checks/README.md)

### 수치
- CI 체크 18개 (기존 15 + 신규 3), 신규 3개 모두 0 violations PASS
- 228 tests pass, tsc daemon/app clean
- 40 files changed, +665 -225

## v0.3.6 - Daemon Self-Register (2026-03-22)

- **Self-register 자동화**: daemon 첫 실행 시 login 401 → `POST /auth/daemon/register` 자동 호출 → login 재시도. 수동 등록 없이 relay에 자동 연결
- **authenticateWithRelay 함수 분리**: `relay-auth.ts`로 auth 로직 추출. login/register/retry 3단계 플로우 + 401 구분 전략 (미등록 vs 잘못된 secret)
- **7개 단위 테스트**: 미등록, 잘못된 secret, 정상, 동시 등록, 에러 핸들링(register 5xx, login 비-401, retry 실패) 시나리오 커버
- 📝 [Phase 문서](../archive/v0.3.6-daemon-self-register/README.md)

### 수치
- daemon 67 tests pass (기존 60 + 신규 7)
- 3 files changed (2 new, 1 modified)

## v0.3.5 - Dead Exports CI 체크 포팅 (2026-03-22)

- **cross/dead-exports 체크 신규**: HypurrQuant에서 검증된 미사용 export 탐지 로직을 WDK-APP 체크 프레임워크에 포팅. `npx tsx scripts/check/index.ts --check=cross/dead-exports`로 파일 내부 미사용 export 자동 탐지
- **export 레벨 dead code 탐지**: 기존 `cross/dead-files`는 파일 단위 도달 가능성만 검사 — 신규 체크는 ts-morph `getExportedDeclarations()` + import 소비자 추적으로 파일 내부 미사용 export까지 커버
- **스캔 대상**: guarded-wdk, daemon, relay, manifest, app, canonical, protocol 7개 패키지
- 📝 [Phase 문서](../archive/v0.3.5-dead-exports-check/README.md)

### 수치
- 94개 dead export 탐지, CI 15개 체크 중 13 pass (2건 pre-existing)
- 2 files changed (1 new, 1 modified)

## v0.3.4 - Dead Code 정리 + Pairing 전면 제거 (2026-03-22)

- **Pairing 3패키지 전면 제거**: daemon `PairingSession` + `pairing_confirm` handler (73줄), protocol `PairingConfirmPayload` + `ControlMessage` variant, app `PairingService.ts` (183줄) + SettingsScreen pairing UI 삭제
- **No Optional 원칙 복원**: `handleChatMessage`의 `queueManager` optional → required. 실행 불가 else 분기(No Fallback 위반) 삭제
- **Daemon misc dead code**: `ToolResult` deprecated alias, `listPending()` + `PendingMessageRequest` 미사용 코드, `getQueue()` public→private, 중복 JSDoc 정리
- **App pairing 문구 정리**: "re-pair" → "re-enroll", "device pairing first" → "generate an identity key first" 등 사용자 대면 문구 일괄 수정
- 📝 [Phase 문서](../archive/v0.3.4-daemon-dead-code-cleanup/README.md)

### 수치
- daemon 60 tests pass, protocol tsc clean, CI 13/14 (1건 pre-existing)
- 40 files changed, +46 -2,364

## v0.3.1 - App 채팅 UX 완성 (2026-03-21)

- **대화 이력 영속성**: useChatStore를 Record\<sessionId, messages[]\> 구조로 전면 재설계 + zustand persist + AsyncStorage. 앱 재시작 후 모든 세션 메시지 유지
- **세션별 대화창**: Chat 탭에 Stack Navigator(ChatListScreen + ChatDetailScreen) 도입. 세션 목록/전환/새 대화 생성
- **ChatMessage discriminated union**: TextChatMessage | ToolChatMessage | StatusChatMessage — No Optional 원칙 준수
- **Daemon source 태그 전파**: _processChatDirect에 source 파라미터 추가. cron 메시지는 typing 스킵, 세션 목록에 "자동 실행" 라벨
- **Tool calls 실시간 표시**: ProcessChatOptions에 onToolStart/onToolDone 콜백. AI 도구 실행 상태가 앱에 실시간 표시
- **오프라인 cron 응답 복구**: streamCursors/controlCursor 영속화 + relay backfillChatStream(one-shot) + app-level sync handler
- **App-level sync 계층**: cursor 추적, cron_session_created 핸들러, non-current 세션 chat 적재를 ChatNavigator로 분리
- 📝 [Phase 문서](../archive/v0.3.1-app-chat-ux/README.md)

### 수치
- app tsc clean, relay ws.ts tsc clean
- 10+ files changed, +1853 -892

## v0.3.2 - 프로토콜 타입 중복 제거 + 취소 API 분리 (2026-03-21)

- **@wdk-app/protocol 패키지 신규**: daemon/app 공유 wire 타입을 한 곳에서 정의 — ControlMessage (9 variant), ControlEvent (4 variant), ChatEvent (7 variant), RelayEnvelope, RelayChannel
- **cancel API 분리**: 기존 `cancel_message` → `cancel_queued` (큐 대기 제거) + `cancel_active` (진행중 중단) 명시적 분리. `message_started` 이벤트로 앱이 상태 판단
- **AbortSignal 전파**: OpenClaw SDK까지 signal 전달 — 진행중 AI 요청 실제 HTTP abort 가능
- **tx_approval handler 추가**: app이 보내는 tx 승인을 daemon에서 처리하도록 추가
- **ChatMessage 네이밍 정리**: daemon의 relay ChatMessage → RelayChatInput으로 분리 (OpenClaw SDK용과 구분)
- 📝 [Phase 문서](../archive/v0.3.2-protocol-dedup-cancel-split/README.md)

### 수치
- daemon 64 tests pass, protocol tsc clean
- 신규 패키지 1개, 수정 파일 23개

## v0.2.9+v0.2.10+v0.2.11 - Daemon 타입 직교성 리팩토링 (2026-03-21)

- **ToolResult → AnyToolResult**: 12개 per-tool discriminated union으로 분리. optional bag 제거
- **ControlPayload → ControlMessage**: 7개 type-discriminated union. `[key:string]:unknown` 인덱스 시그니처 제거
- **WDKContext → ToolExecutionContext**: `broker:any`/`store:any` → Port interface (ToolStorePort 9개, ApprovalBrokerPort 1개, AdminStorePort 2개)
- **ai-tool-schema.ts 분리**: ToolDefinition + TOOL_DEFINITIONS를 execution 모듈에서 분리
- **CronBase 도입**: Cron 타입 3중 복제 → extends 패턴
- **CronScheduler dispatch 콜백화**: MessageQueueManager 직접 참조 제거
- **Options → Config+Deps**: depth inflation 해소 (max depth 7→3)
- 📝 Phase 문서: [v0.2.9](../archive/v0.2.9-daemon-wide-bag-union/README.md), [v0.2.10](../archive/v0.2.10-wdkcontext-decomposition/README.md), [v0.2.11](../archive/v0.2.11-daemon-type-infra-cleanup/README.md)

### 수치
- daemon 64 tests pass, 순환 의존 0, max depth 3
- 15 files changed, +730 -479

## v0.1.6 - Layer 0 타입 정리 (2026-03-19)

- **PolicyInput 도입**: `SignedPolicy` → `PolicyInput` rename. parsed form 입력, store가 직렬화 담당. `StoredPolicy` 독립 타입으로 분리
- **JournalEntry 분리**: `JournalInput`(생성 5필드 required) + `JournalEntry`(저장 8필드 required) — No Optional 원칙 준수
- **CronInput 정리**: `id`/`createdAt` 제거 (store 책임), `sessionId`/`chainId` required화
- **@internal 누수 차단**: `loadPendingByRequestId` → `PendingApprovalRequest` 반환, `listCrons` → `StoredCron[]` 반환
- **CronRow + StoredCron**: `CronRecord` → `CronRow` (internal) + `StoredCron` (public camelCase, `isActive: boolean`)
- **saveCron 반환 타입**: `void` → `string` (생성된 cron id 반환)
- **Breaking Change**: `SignedPolicy`, `CronRecord` 타입 제거, daemon snake_case 접근 전면 camelCase 전환

### 수치
- guarded-wdk: 161 tests, 6 suites pass
- 15 files changed, +281 -273
