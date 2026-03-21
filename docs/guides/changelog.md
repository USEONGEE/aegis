# Changelog

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
