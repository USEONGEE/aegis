# DoD (Definition of Done) - v0.4.0

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | 위반 #1 (canonical `IntentInput.value?`) — `value: string` required로 변경, 호출부 `'0'` 명시 | `rg '\?:' packages/canonical/src/index.ts`에서 `IntentInput` 내 `value` 관련 0건 |
| F2 | 위반 #2~#7 (protocol `ControlResult`) — 8-variant discriminated union으로 분리, optional 필드 0개 | `rg '\?:' packages/protocol/src/control.ts`에서 `ControlResult` 관련 0건 + DU variant 8개 확인 |
| F3 | 위반 #8~#13 (protocol `RelayEnvelope`) — 모든 필드 required (`T \| null` 또는 `T`), optional 0개 | `rg '\?:' packages/protocol/src/relay.ts`에서 `RelayEnvelope` 관련 0건 |
| F4 | 위반 #14~#15 (guarded-wdk `VerificationContext`) — `currentPolicyVersion: number \| null`, `expectedTargetHash: string \| null` | `rg 'VerificationContext' packages/guarded-wdk/src/approval-verifier.ts`에서 `?:` 0건 |
| F5 | 위반 #16~#21 (guarded-wdk store 타입) — 모든 optional을 required(`T \| null`) 또는 required(`T`)로 변환 | `rg '\?:' packages/guarded-wdk/src/approval-store.ts`에서 위반 대상 심볼 내 0건 (정당한 QueryOpts optional 제외) |
| F6 | 위반 #22~#26 (guarded-wdk config/facade) — `wallets`, `protocols` required, `approvalBroker: T \| null`, `trustedApprovers: string[]`, `index: number` | `rg '\?:' packages/guarded-wdk/src/guarded-wdk-factory.ts`에서 `GuardedWDKConfig` 내 0건 |
| F7 | 위반 #27~#29 (guarded-wdk broker) — `requestId: string`, `walletName: string \| null`, `emitter: EventEmitter` | `rg '\?' packages/guarded-wdk/src/signed-approval-broker.ts`에서 optional param 0건 |
| F8 | 위반 #30 (manifest `ValidationResult`) — `ValidationResultValid \| ValidationResultInvalid` DU 분리 | `rg '\?:' packages/manifest/src/types.ts`에서 `ValidationResult` 관련 0건 |
| F9 | 위반 #31~#34 (daemon queue) — `chainId: number \| null`, `cronId: string \| null`, `CancelResult` DU 분리 | `rg '\?:' packages/daemon/src/message-queue.ts`에서 위반 대상 0건 (정당한 `MessageQueueOptions` 제외) |
| F10 | 위반 #35~#37 (daemon `handleControlMessage`) — `ControlHandlerDeps` 객체 패턴으로 변환, optional params 0개 | `rg 'handleControlMessage' packages/daemon/src/control-handler.ts`에서 `?` param 0건 |
| F11 | 위반 #38~#39 (daemon tool args) — `accountIndex: number` required | `rg 'accountIndex\?' packages/daemon/src/tool-surface.ts` → 0건 |
| F12 | 위반 #40~#42 (daemon journal/admin) — `JournalEntry` required, `AdminRequest` command별 DU, `AdminResponse` ok/error DU | `rg '\?:' packages/daemon/src/execution-journal.ts packages/daemon/src/admin-server.ts`에서 위반 대상 심볼 내 0건 |
| F13 | 위반 #43~#47 (relay auth/ws) — `PairBody` DU, `JwtPayload` DU, `IncomingMessage` required | `rg '\?:' packages/relay/src/routes/auth.ts packages/relay/src/routes/ws.ts`에서 위반 대상 심볼 내 0건 |
| F14 | 위반 #48 (relay `PushResult`) — `PushResultOk \| PushResultFailed` DU | `rg '\?:' packages/relay/src/routes/push.ts`에서 `PushResult` 관련 0건 |
| F15 | 위반 #49~#54 (relay registry) — `passwordHash`, `pushToken`, `metadata` 등 모두 `T \| null` required | `rg '\?:' packages/relay/src/registry/registry-adapter.ts`에서 위반 대상 심볼 내 0건 |
| F16 | 위반 #55~#58 (app store 타입) — `constraints`, `description`, `chainId`, `details` 모두 `T \| null` required | `rg '\?:' packages/app/src/stores/usePolicyStore.ts packages/app/src/stores/useActivityStore.ts`에서 위반 대상 심볼 내 0건 |
| F17 | 위반 #59~#60 (app `policyVersion`) — `policyVersion: number` required (보안 필드) | `rg 'policyVersion\?' packages/app/src/core/approval/SignedApprovalBuilder.ts` → 0건 |
| F18 | 위반 #61 (app `EncryptedMessage.ephemeralPubKey`) — dead field 제거 | `rg 'ephemeralPubKey' packages/app/src/core/crypto/E2ECrypto.ts` → 0건 |
| F19 | 위반 #62~#63 (app relay 타입) — `sessionId: string \| null`, `messageId: string`, `timestamp: number` | `rg '\?:' packages/app/src/core/relay/RelayClient.ts`에서 `RelayMessage`, `ControlEnvelope` 내 0건 |
| F20 | 위반 #64 (app `connect.authToken`) — `authToken: string` required (보안 필드) | `rg 'authToken\?' packages/app/src/core/relay/RelayClient.ts` → 0건 |
| F21 | 위반 64건만 수정하고 그 외 optional은 건드리지 않음 | `git diff`에서 수정된 `?:` 제거 행이 README SoT 64건의 파일/심볼에만 해당하는지 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 모든 패키지 TypeScript 컴파일 성공 (이번 Phase로 인한 신규 에러 0건) | 각 패키지 `npx tsc --noEmit`: canonical, protocol, guarded-wdk, manifest, daemon, app — 6개 에러 0. relay는 pre-existing 18건만 (redis-queue ioredis CJS/ESM interop + pg-registry 테스트 타입 — baseline `04e08b0`에서 동일) |
| N2 | 테스트가 있는 패키지의 기존 테스트 통과 | 각 패키지 `npm test`: canonical, guarded-wdk, manifest, daemon — 4개 PASS. relay 27/29 (pre-existing registerDevice 2건 — baseline `04e08b0`에서 동일 실패) |
| N3 | 패키지 간 의존 방향 변경 없음 (단방향 유지) | 수정 전후 `scripts/type-dep-graph/index.ts` JSON 출력의 cross-package edge 목록을 비교하여 새로운 역방향 edge가 0건 |
| N4 | 이번 Phase에서 새로운 위반 optional 0건 도입 | `git diff`에서 신규 `?:` 추가 행을 확인, 정당한 optional(QueryOpts, config 등) 외에 위반 패턴의 새 `?:` 0건 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `ControlResult` DU 변경 후 daemon `control-handler.ts`에서 모든 control message 타입별 분기가 올바른 variant를 반환 | 각 case에서 반환 타입이 DU의 해당 variant와 일치 | `tsc --noEmit` 통과 (타입 narrowing 검증) + `control-handler.test.ts` PASS (런타임 검증) |
| E2 | `handleControlMessage` deps 객체 패턴 변경 후 daemon 부팅 | index.ts에서 deps 객체를 올바르게 구성하여 전달 | `tsc --noEmit` 통과 + `control-handler.test.ts` PASS (deps 객체 전달 테스트) |
| E3 | `GuardedWDKConfig`에서 signer가 0명 (빈 배열)일 때 | factory가 빈 배열을 허용하고 broker 생성 성공 | `tsc --noEmit` 통과 + factory 테스트에 빈 배열 케이스 fixture 추가 (회귀 테스트 보강) |
| E4 | `RelayEnvelope` required+null 변환 후 daemon→relay→app envelope 구성 | 각 패키지의 envelope 구성 코드가 null을 명시적으로 전달 | `tsc --noEmit` 통과 (null 누락 시 컴파일 에러) |
| E5 | `ControlEnvelope.messageId/timestamp` required(non-null) 변환 후 `buildEnvelope()` | extras spread가 기본값을 덮어쓰지 않음 | `tsc --noEmit` 통과 + `buildEnvelope()` 호출부에서 `messageId`, `timestamp` 가 extras에 없음을 코드 리뷰로 확인 (git diff) |
| E6 | `IntentInput.value` required 변환 후 호출부 | 모든 호출부에서 `value` 값을 명시적으로 전달 | `canonical` 테스트 PASS + `tsc --noEmit` 통과 |
| E7 | `SignedApprovalBuilder.forTx.policyVersion` required 변환 후 app 승인 흐름 | 호출부에서 policyVersion을 명시적으로 전달 | `tsc --noEmit` 통과 (누락 시 컴파일 에러) |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 64건 위반 전수 수정 | F1~F20 (위반 #1~#64 개별 검증) | ✅ |
| 패턴별 적절한 해소 방법 적용 | F1~F20 (각 항목이 해소 방법 명시) | ✅ |
| 수정 후 tsc, 테스트 통과 | N1, N2 | ✅ |
| 정당한 optional 불변 | F21, N4 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| ControlResult DU 분리 | F2, E1 | ✅ |
| RelayEnvelope required+null | F3, E4 | ✅ |
| handleControlMessage deps 객체 | F10, E2 | ✅ |
| GuardedWDKConfig 빈 signer 허용 | F6, E3 | ✅ |
| ControlEnvelope non-null + buildEnvelope 수정 | F19, E5 | ✅ |
| EncryptedMessage.ephemeralPubKey 제거 | F18 | ✅ |
| 보안 필드 required | F17, F20, E7 | ✅ |
| 의존 방향 순서(leaf→root) 수정 | N3 | ✅ |

## Deferred / Out of Scope (후속 Phase)
- `chat.ts source?` 6건: backward compat optional → 이번 Phase 범위 외, 후속 검토
- `RelayEnvelope` 완전 DU 분리: v0.4.1로 연기 (이번에는 required+null만)
