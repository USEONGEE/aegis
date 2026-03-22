# 작업 티켓 - v0.4.0

## 전체 현황

| # | Step | 패키지 | 위반 건수 | 난이도 | 롤백 | 선행 | 개발 | 완료일 |
|---|------|--------|----------|--------|------|------|------|--------|
| 01 | [canonical + protocol Leaf 타입 확정](step-01-canonical-protocol.md) | canonical, protocol | 13 (#1~#13) | 🔴 | ✅ | 없음 | ⏳ | - |
| 02 | [guarded-wdk 내부 타입 정리](step-02-guarded-wdk.md) | guarded-wdk | 16 (#14~#29) | 🟠 | ✅ | Step 01 | ⏳ | - |
| 03 | [manifest ValidationResult DU](step-03-manifest.md) | manifest | 1 (#30) | 🟢 | ✅ | Step 02 | ⏳ | - |
| 04 | [daemon 내부 타입 + deps](step-04-daemon.md) | daemon | 12 (#31~#42) | 🟠 | ✅ | Step 01, 02 | ⏳ | - |
| 05 | [relay 타입 정리](step-05-relay.md) | relay | 12 (#43~#54) | 🟡 | ✅ | Step 01 | ⏳ | - |
| 06 | [app 타입 정리](step-06-app.md) | app | 10 (#55~#64) | 🟡 | ✅ | Step 01 | ⏳ | - |

**총 위반**: 64건 / **총 Step**: 6개

## 의존성 그래프

```
Step 01 (canonical + protocol) ─── leaf, 선행 없음
   │
   ├── Step 02 (guarded-wdk) ──── Step 01 이후
   │      │
   │      ├── Step 03 (manifest) ── Step 02 이후
   │      │
   │      └── Step 04 (daemon) ─── Step 01 + 02 이후
   │
   ├── Step 05 (relay) ────────── Step 01 이후
   │
   └── Step 06 (app) ──────────── Step 01 이후
```

**병렬 가능**: Step 01 완료 후 Step 02/05/06 병렬 진행 가능. Step 03/04는 Step 02 완료 필요.

**권장 실행 순서**: 01 -> 02 -> 03 -> 04 -> 05 -> 06 (직렬, 안전)

## 커버리지 매트릭스

### PRD 목표 -> 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 64건 위반 전수 수정 | Step 01~06 (#1~#64) | ✅ |
| Wide Bag -> DU 또는 required+null | Step 01 (#2~#13), Step 02 (#14~#15), Step 04 (#31~#32, #40), Step 05 (#43~#47, #49~#50, #52~#53), Step 06 (#57, #62) | ✅ |
| DU 미적용 -> DU 분리 | Step 01 (#2~#7), Step 02 (#16~#19, #21, #24~#25, #27~#28), Step 03 (#30), Step 04 (#33~#34, #42), Step 05 (#44~#46, #48), Step 06 (#61) | ✅ |
| Default 대신 Optional -> required | Step 01 (#1), Step 02 (#22~#23, #26), Step 04 (#38~#39) | ✅ |
| Required+null 대신 Optional -> T \| null | Step 02 (#20), Step 05 (#51, #54), Step 06 (#55~#56, #58, #63) | ✅ |
| Optional Deps -> 필수 주입 | Step 02 (#29), Step 04 (#35~#37) | ✅ |
| 보안 필드 -> required | Step 06 (#59~#60, #64) | ✅ |
| 정당한 optional 불변 | Phase Closeout (F21, N4) | ✅ |
| 수정 후 tsc, 테스트 통과 | Step 01~06 (N1), Step 01~05 (N2) | ✅ |

### DoD -> 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 (IntentInput.value required) | Step 01 | ✅ |
| F2 (ControlResult 8-variant DU) | Step 01 | ✅ |
| F3 (RelayEnvelope required+null) | Step 01 | ✅ |
| F4 (VerificationContext required+null) | Step 02 | ✅ |
| F5 (store 타입 required) | Step 02 | ✅ |
| F6 (GuardedWDKConfig required) | Step 02 | ✅ |
| F7 (broker requestId/walletName/emitter required) | Step 02 | ✅ |
| F8 (ValidationResult DU) | Step 03 | ✅ |
| F9 (QueuedMessage required+null, CancelResult DU) | Step 04 | ✅ |
| F10 (handleControlMessage ControlHandlerDeps) | Step 04 | ✅ |
| F11 (accountIndex required) | Step 04 | ✅ |
| F12 (JournalEntry required, AdminRequest/Response DU) | Step 04 | ✅ |
| F13 (relay auth/ws 타입 required) | Step 05 | ✅ |
| F14 (PushResult DU) | Step 05 | ✅ |
| F15 (registry 타입 required+null) | Step 05 | ✅ |
| F16 (app store 타입 required+null) | Step 06 | ✅ |
| F17 (policyVersion required, 보안 필드) | Step 06 | ✅ |
| F18 (ephemeralPubKey 제거) | Step 06 | ✅ |
| F19 (RelayMessage/ControlEnvelope required) | Step 06 | ✅ |
| F20 (authToken required, 보안 필드) | Step 06 | ✅ |
| F21 (정당한 optional 불변) | Phase Closeout (전체 git diff 검증) | ✅ |
| N1 (tsc --noEmit 7패키지 통과) | Step 01~06 (각 Step에서 해당 패키지 tsc) | ✅ |
| N2 (기존 테스트 통과) | Step 01~05 (테스트 있는 패키지만) | ✅ |
| N3 (패키지 의존 방향 불변) | Phase Closeout (type-dep-graph 비교) | ✅ |
| N4 (신규 위반 optional 0건) | Phase Closeout (전체 git diff 검증) | ✅ |
| E1 (ControlResult DU narrowing + 테스트) | Step 01, Step 04 | ✅ |
| E2 (handleControlMessage deps 객체 + 테스트) | Step 04 | ✅ |
| E3 (GuardedWDKConfig 빈 signer 허용) | Step 02 | ✅ |
| E4 (RelayEnvelope null 명시 전달) | Step 01, Step 04, Step 05, Step 06 | ✅ |
| E5 (ControlEnvelope buildEnvelope spread 순서) | Step 06 | ✅ |
| E6 (IntentInput.value 호출부 명시) | Step 01 | ✅ |
| E7 (policyVersion required 호출부 전달) | Step 06 | ✅ |

### 설계 결정 -> 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| ControlResult 8-variant DU 분리 | Step 01 (정의), Step 04 (cascade 수신) | ✅ |
| RelayEnvelope required+null (DU는 v0.4.1) | Step 01 (정의), Step 04/05/06 (cascade 수신) | ✅ |
| handleControlMessage ControlHandlerDeps 객체 패턴 | Step 04 | ✅ |
| GuardedWDKConfig 빈 signer (`trustedApprovers: []`) 허용 | Step 02 | ✅ |
| ControlEnvelope non-null + buildEnvelope spread 수정 | Step 06 | ✅ |
| EncryptedMessage.ephemeralPubKey dead field 제거 | Step 06 | ✅ |
| 보안 필드 (policyVersion, authToken) required | Step 06 | ✅ |
| PendingApprovalRequest.walletName required+null (DU 회피) | Step 02 | ✅ |
| CancelResult/ValidationResult/PushResult/AdminResponse DU 분리 | Step 03, 04, 05 | ✅ |
| 의존 방향 순서 (leaf -> root) 수정 | Step 01~06 순서 | ✅ |

## 위반 ID -> Step 매핑 (전수 추적)

| 위반 # | 패키지 | 타입/심볼 | 패턴 | Step |
|--------|--------|----------|------|------|
| 1 | canonical | IntentInput.value | Default 대신 Optional | 01 |
| 2 | protocol | ControlResult.type | Wide Bag | 01 |
| 3 | protocol | ControlResult.requestId | Wide Bag | 01 |
| 4 | protocol | ControlResult.messageId | Wide Bag | 01 |
| 5 | protocol | ControlResult.error | Wide Bag | 01 |
| 6 | protocol | ControlResult.reason | Wide Bag | 01 |
| 7 | protocol | ControlResult.wasProcessing | Wide Bag | 01 |
| 8 | protocol | RelayEnvelope.payload | Wide Bag | 01 |
| 9 | protocol | RelayEnvelope.encrypted | Wide Bag | 01 |
| 10 | protocol | RelayEnvelope.sessionId | Wide Bag | 01 |
| 11 | protocol | RelayEnvelope.userId | Wide Bag | 01 |
| 12 | protocol | RelayEnvelope.daemonId | Wide Bag | 01 |
| 13 | protocol | RelayEnvelope.userIds | Wide Bag | 01 |
| 14 | guarded-wdk | VerificationContext.currentPolicyVersion | Wide Bag | 02 |
| 15 | guarded-wdk | VerificationContext.expectedTargetHash | Wide Bag | 02 |
| 16 | guarded-wdk | PendingApprovalRequest.walletName | DU 미적용 | 02 |
| 17 | guarded-wdk | HistoryEntry.requestId | DU 미적용 | 02 |
| 18 | guarded-wdk | HistoryEntry.content | DU 미적용 | 02 |
| 19 | guarded-wdk | HistoryEntry.signedApproval | DU 미적용 | 02 |
| 20 | guarded-wdk | ApprovalStore.saveSigner._name | Required+null | 02 |
| 21 | guarded-wdk | ApprovalStore.updateJournalStatus._txHash | DU 미적용 | 02 |
| 22 | guarded-wdk | GuardedWDKConfig.wallets | Default 대신 Optional | 02 |
| 23 | guarded-wdk | GuardedWDKConfig.protocols | Default 대신 Optional | 02 |
| 24 | guarded-wdk | GuardedWDKConfig.approvalBroker | DU 미적용 | 02 |
| 25 | guarded-wdk | GuardedWDKConfig.trustedApprovers | DU 미적용 | 02 |
| 26 | guarded-wdk | GuardedWDKFacade.getAccount.index | Default 대신 Optional | 02 |
| 27 | guarded-wdk | CreateRequestOptions.requestId | DU 미적용 | 02 |
| 28 | guarded-wdk | CreateRequestOptions.walletName | DU 미적용 | 02 |
| 29 | guarded-wdk | SignedApprovalBroker.emitter | Optional Deps | 02 |
| 30 | manifest | ValidationResult.errors | DU 미적용 | 03 |
| 31 | daemon | QueuedMessage.chainId | Wide Bag | 04 |
| 32 | daemon | QueuedMessage.cronId | Wide Bag | 04 |
| 33 | daemon | CancelResult.reason | DU 미적용 | 04 |
| 34 | daemon | CancelResult.wasProcessing | DU 미적용 | 04 |
| 35 | daemon | handleControlMessage.relayClient | Optional Deps | 04 |
| 36 | daemon | handleControlMessage.approvalStore | Optional Deps | 04 |
| 37 | daemon | handleControlMessage.queueManager | Optional Deps | 04 |
| 38 | daemon | ChainArgs.accountIndex | Default 대신 Optional | 04 |
| 39 | daemon | CronIdArgs.accountIndex | Default 대신 Optional | 04 |
| 40 | daemon | JournalEntry.chainId | Wide Bag | 04 |
| 41 | daemon | JournalEntry.txHash | DU 미적용 | 04 |
| 42 | daemon | AdminRequest/AdminResponse | Wide Bag | 04 |
| 43 | relay | PairBody.pushToken | Wide Bag | 05 |
| 44 | relay | JwtPayload.deviceId | Wide Bag | 05 |
| 45 | relay | signAppToken.deviceId | Wide Bag | 05 |
| 46 | relay | Google body.deviceId | Wide Bag | 05 |
| 47 | relay | IncomingMessage/OutgoingMessage | Wide Bag | 05 |
| 48 | relay | PushResult.ticketId/error | DU 미적용 | 05 |
| 49 | relay | UserRecord.passwordHash | Wide Bag | 05 |
| 50 | relay | DeviceRecord.pushToken | Wide Bag | 05 |
| 51 | relay | SessionRecord.metadata | Required+null | 05 |
| 52 | relay | CreateUserParams.passwordHash | Wide Bag | 05 |
| 53 | relay | RegisterDeviceParams.pushToken | Wide Bag | 05 |
| 54 | relay | CreateSessionParams.metadata | Required+null | 05 |
| 55 | app | Policy.constraints | Required+null | 06 |
| 56 | app | Policy.description | Required+null | 06 |
| 57 | app | ActivityEvent.chainId | Wide Bag | 06 |
| 58 | app | ActivityEvent.details | Required+null | 06 |
| 59 | app | forTx.policyVersion | 보안 필드 | 06 |
| 60 | app | build.policyVersion | 보안 필드 | 06 |
| 61 | app | EncryptedMessage.ephemeralPubKey | DU 미적용 (dead) | 06 |
| 62 | app | RelayMessage.sessionId | Wide Bag | 06 |
| 63 | app | ControlEnvelope.messageId/timestamp | Required+null | 06 |
| 64 | app | connect.authToken | 보안 필드 | 06 |

**커버리지**: 64/64 (100%)

## Phase Closeout 검증 (Step 01~06 완료 후)

Step 01~06 개별 완료 후, 아래 항목을 **Phase 전체 수준에서 최종 검증**:

| 항목 | 검증 방법 |
|------|----------|
| F21 (정당 optional 불변) | `git diff`에서 `?:` 제거 행이 README SoT 64건 파일/심볼에만 해당하는지 확인 |
| N3 (의존 방향 불변) | 수정 전후 `type-dep-graph` JSON cross-package edge 비교, 새 역방향 edge 0건 |
| N4 (신규 위반 optional 0건) | `git diff`에서 신규 `?:` 추가 행 확인, 위반 패턴의 새 `?:` 0건 |

## Step 상세
- [Step 01: canonical + protocol Leaf 타입 확정](step-01-canonical-protocol.md)
- [Step 02: guarded-wdk 내부 타입 정리](step-02-guarded-wdk.md)
- [Step 03: manifest ValidationResult DU](step-03-manifest.md)
- [Step 04: daemon 내부 타입 + deps](step-04-daemon.md)
- [Step 05: relay 타입 정리](step-05-relay.md)
- [Step 06: app 타입 정리](step-06-app.md)
