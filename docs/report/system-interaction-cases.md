# WDK-APP 시스템 상호작용 케이스 전체 맵

> 모든 모듈 간 상호작용을 케이스별로 분류하고, 각 케이스에서 어떤 모듈이 어떤 역할을 하는지 코드 레벨로 문서화.

---

## 개요

WDK-APP은 6개 패키지(canonical, guarded-wdk, manifest, daemon, relay, app)로 구성된 모노레포.

**⚠️ 아래 Case 1~14는 설계 의도 기준 흐름이다.** 현재 코드와의 차이(Gap)는 문서 말미 "현재 구현 갭 분석" 섹션에 정리. 각 Case에서 `[GAP N]` 표시가 있으면 해당 Gap 참조.

**범례:**
- `→` = 함수 호출 / 메시지 전송
- `⇐` = 반환값 / 응답
- `⚡` = 이벤트 emit
- `❌` = 에러 throw
- `🔒` = 보안 검증

---

## Case 1: AI가 tx 실행 — AUTO (policy 즉시 통과)

```
사용자: "500 USDC repay 해줘"
  │
  ▼
[RN App] ──chat_queue──► [Relay] ──WS──► [daemon]
                                           │
                                    chat-handler.ts
                                           │ processChat()
                                           ▼
                                    [OpenClaw API]
                                           │ tool_call: sendTransaction
                                           ▼
                                    tool-surface.ts
                                    │ 1. canonical.intentHash({chain, to, data, value})
                                    │ 2. journal.isDuplicate(hash) → false
                                    │ 3. wdk.getAccount(chain, 0)
                                    │ 4. Promise.race([
                                    │      account.sendTransaction(tx),
                                    │      listenForApprovalRequested()
                                    │    ])
                                    ▼
                              guarded-middleware.ts
                              │ ⚡ IntentProposed
                              │ evaluatePolicy(policies, chain, tx)
                              │   → timestamp gate 통과
                              │   → permission 매칭: target+selector+args → AUTO
                              │ ⚡ PolicyEvaluated { decision: 'AUTO' }
                              │ rawSendTransaction(tx)
                              │ ⚡ ExecutionBroadcasted { hash, fee }
                              │ pollReceipt() (background)
                              │ ⚡ ExecutionSettled (async)
                              ⇐ { hash, fee }
                                    │
                              tool-surface.ts
                              │ journal.track(intentId, { seedId, chainId, targetHash }) → status: 'received'
                              │ journal.updateStatus(intentId, 'settled', hash) → status: 'settled'
                              ⇐ { status: 'executed', hash, fee, chain }
                                    │
                              [OpenClaw API]
                              │ "500 USDC repay 완료. tx: 0xabc..."
                              ⇐ assistant message
                                    │
                              daemon → Relay → RN App (chat_queue)
```

**모듈별 역할:**

| 모듈 | 역할 |
|------|------|
| canonical | intentHash 계산 (중복 방지 키) |
| guarded-middleware | policy 평가 (evaluatePolicy), 이벤트 emit |
| tool-surface | tool_call 디스패치, journal dedupe, Promise.race |
| execution-journal | 중복 실행 방지 |
| relay | chat_queue 메시지 중계 |

---

## Case 2: AI가 tx 실행 — REQUIRE_APPROVAL (승인 필요)

```
                              tool-surface.ts
                              │ Promise.race 시작
                              ▼
                        guarded-middleware.ts
                        │ evaluatePolicy → REQUIRE_APPROVAL
                        │ ⚡ ApprovalRequested { requestId, target, selector }
                        │ broker.createRequest('tx', { targetHash })
                        │ broker.waitForApproval(requestId, 60000) ← 여기서 블로킹
                        │
                        tool-surface.ts
                        │ ApprovalRequested 이벤트 수신 (race에서 이김)
                        │ 즉시 반환: { status: 'pending_approval', requestId }
                        │ background에서 txPromise 계속 대기
                        │
                        OpenClaw → "승인이 필요합니다" → daemon → Relay → App
                        │
            ┌───────────────────────────────────────────────┐
            │ RN App (Approval 탭)                           │
            │ 1. approval 요청 수신 → Approval 목록에 표시     │
            │ 2. 사용자가 상세 확인 (to, data, value, chain)   │
            │ 3. 승인 버튼 터치                                │
            │ 4. SignedApprovalBuilder.forTx({                │
            │      targetHash: intentHash,                    │
            │      chain, requestId, policyVersion            │
            │    })                                           │
            │ 5. Ed25519 서명 (identity key)                   │
            │ 6. RelayClient.sendApproval(signedApproval)     │
            └───────────┬───────────────────────────────────┘
                        │
                  [Relay] control_channel (E2E 암호화)
                        │
                  [daemon] control-handler.ts
                  │ case 'tx_approval':
                  │ broker.submitApproval(signedApproval, context)
                  │   ▼
                  │ 🔒 approval-verifier.ts (6단계)
                  │   1. approver ∈ trustedApprovers? ✅
                  │   2. deviceId not revoked? ✅
                  │   3. Ed25519.verify(sig)? ✅
                  │   4. expiresAt > now? ✅
                  │   5. nonce > lastNonce? ✅
                  │   6. targetHash === intentHash? policyVersion === current? ✅
                  │
                  │ → Promise resolve (middleware의 waitForApproval 풀림)
                  │
            guarded-middleware.ts
            │ ⚡ ApprovalGranted { approver }
            │ rawSendTransaction(tx) → 서명 → 제출
            │ ⚡ ExecutionBroadcasted { hash, fee }
            │
            tool-surface.ts (background promise)
            │ relay.send('control', { type: 'approval_result', txHash, fee })
            │
            [Relay] → [RN App]
            │ TxApprovalContext: signing → success
```

**모듈별 역할:**

| 모듈 | 역할 |
|------|------|
| guarded-middleware | policy 평가, waitForApproval 블로킹, tx 실행 |
| signed-approval-broker | createRequest, waitForApproval (Promise), submitApproval (resolve) |
| approval-verifier | 6단계 서명 검증 |
| tool-surface | Promise.race로 pending_approval 즉시 반환, background 완료 처리 |
| control-handler | control_channel 메시지 디스패치 |
| SignedApprovalBuilder (app) | Ed25519 서명 envelope 생성 |
| TxApprovalContext (app) | UI 상태 머신 (idle→pending→signing→success) |
| relay | E2E 암호화 메시지 중계 |

---

## Case 3: AI가 tx 실행 — REJECT (policy 거부)

```
                        guarded-middleware.ts
                        │ evaluatePolicy → REJECT (매칭 없음)
                        │ ⚡ PolicyEvaluated { decision: 'REJECT', reason }
                        │ ❌ throw PolicyRejectionError(reason)
                        │
                        tool-surface.ts
                        │ catch (PolicyRejectionError)
                        ⇐ { status: 'rejected', reason, intentHash }
                        │
                        OpenClaw: "이 작업은 policy에 의해 거부됐습니다"
                        │ → policyRequest tool_call로 policy 요청 (Case 4로)
```

---

## Case 4: AI가 policy 요청

```
                        OpenClaw: tool_call { name: 'policyRequest', args: { chain, reason, policies } }
                        │
                        tool-surface.ts
                        │ 1. canonical.policyHash(policies)
                        │ 2. broker.createRequest('policy', {
                        │      chain, targetHash: hash, requestId, metadata: { seedId, reason, policies }
                        │    })
                        │ 3. ⚡ PendingPolicyRequested { requestId, chain }
                        │ 4. store.savePending(seedId, request)
                        ⇐ { requestId, status: 'pending', policyHash }
                        │
                        OpenClaw → "이 policy가 필요합니다. RN App에서 승인해주세요."
                        │
                        daemon → Relay (control_channel) → RN App
                        │ App: Policy 탭에 pending 표시
```

---

## Case 5: owner가 pending policy 승인

```
            ┌───────────────────────────────────────────────┐
            │ RN App (Policy 탭)                             │
            │ 1. pending policy 목록에서 선택                  │
            │ 2. policy 내용 확인 (permissions, decision 등)   │
            │ 3. 승인 버튼                                    │
            │ 4. SignedApprovalBuilder.forPolicy({            │
            │      targetHash: policyHash,                    │
            │      chain, requestId                           │
            │    })                                           │
            │ 5. RelayClient.sendApproval() → type: policy_approval│
            └───────────┬───────────────────────────────────┘
                        │
                  [Relay] control_channel
                        │
                  [daemon] control-handler.ts
                  │ case 'policy_approval':
                  │ broker.submitApproval(signedApproval)
                  │   → 🔒 6단계 검증
                  │   → step 6: targetHash === SHA-256(policies)? ✅
                  │
                  │ store.removePending(requestId)
                  │ ⚡ PolicyApplied { chain }
                  │ wdk.updatePolicies(chain, { policies })
                  │   → WDK countersign (seed로 서명) [GAP 12: 현재 미구현]
                  │   → store.savePolicy(seedId, chain, signedPolicy)
                  │   → 런타임 policy 교체 (immutable snapshot)
                  │
                  ⇐ { ok: true, type: 'policy_approval' }
```

**이후**: AI가 재시도하면 policy가 있으므로 Case 1 또는 2로 진행.

---

## Case 6: owner가 pending policy 거부

```
            RN App: SignedApprovalBuilder.forPolicyReject({ targetHash, chain, requestId })
                        │
                  [Relay] → [daemon] control-handler.ts
                  │ case 'policy_reject':
                  │ broker.submitApproval({ ...signedApproval, type: 'policy_reject' })
                  │   → 🔒 6단계 검증
                  │ store.removePending(requestId)
                  │ broker waiter → reject(Error('Policy rejected by owner'))
                  │ ⚡ ApprovalRejected
```

---

## Case 7: owner가 device revoke

```
            ┌───────────────────────────────────────────────┐
            │ RN App (Settings 탭)                           │
            │ 1. paired 디바이스 목록에서 선택                  │
            │ 2. revoke 버튼                                  │
            │ 3. SignedApprovalBuilder.forDeviceRevoke({      │
            │      targetDeviceId: 'device_lost'              │
            │    })                                           │
            │    targetHash = SHA-256(targetDeviceId)          │
            │    metadata.deviceId = targetDeviceId            │
            │ 4. RelayClient.sendApproval() → type: device_revoke│
            └───────────┬───────────────────────────────────┘
                        │
                  [daemon] control-handler.ts
                  │ case 'device_revoke':
                  │ 1. deviceId = signedApproval.metadata.deviceId
                  │ 2. expectedTargetHash = '0x' + SHA-256(deviceId)
                  │ 3. broker.submitApproval(signedApproval, { expectedTargetHash })
                  │    → 🔒 6단계 검증 (step 6: targetHash === expectedTargetHash)
                  │ 4. store.revokeDevice(deviceId)
                  │ 5. active devices → broker.setTrustedApprovers(activeKeys)
                  │ ⚡ DeviceRevoked { deviceId }
                  │
                  │ 이후: revoked device의 SignedApproval은 step 2에서 거부됨
```

---

## Case 8: 최초 pairing (앱 ↔ daemon 연결)

```
            ┌───────────────────────────────────────────────┐
            │ daemon 시작                                    │
            │ 1. ApprovalStore.getActiveSeed() → mnemonic    │
            │ 2. createGuardedWDK({ seed, ... })             │
            │ 3. Relay에 outbound WebSocket 연결              │
            │ 4. OpenClaw API 연결 (localhost:18789)          │
            └───────────────────────────────────────────────┘

            ┌───────────────────────────────────────────────┐
            │ RN App 설치 → Settings → Pairing 시작           │
            │ 1. IdentityKeyManager.generate()                │
            │    → Ed25519 keypair → Expo SecureStore 저장    │
            │ 2. PairingService.initiatePairing()             │
            │    → QR 코드 스캔 (daemon의 public key + relay URL)│
            │ 3. E2ECrypto: ECDH 키 교환                      │
            │ 4. SAS 확인 (6자리 코드 양쪽 비교)               │
            │ 5. pairing_confirm 전송:                        │
            │    { deviceId, identityPubKey, encryptionPubKey }│
            └───────────┬───────────────────────────────────┘
                        │
                  [Relay] control_channel
                        │
                  [daemon] control-handler.ts
                  │ case 'pairing_confirm':
                  │ 1. store.saveDevice(deviceId, identityPubKey)
                  │ 2. broker.setTrustedApprovers([...current, identityPubKey])
                  │ 3. encryptionPubKey 저장 (Phase 2 ECDH)
                  ⇐ { ok: true, type: 'pairing_confirm', deviceId }
```

---

## Case 9: cron 등록 + 주기 실행

```
            사용자: "5분마다 Aave health factor 감시해줘"
                        │
            OpenClaw: tool_call { name: 'registerCron', args: {
              interval: '5m', prompt: 'Check Aave health factor...',
              chain: 'ethereum', sessionId: 'session_abc'
            }}
                        │
            tool-surface.ts
            │ store.saveCron(seedId, { id, sessionId, interval, prompt, chain })
            ⇐ { cronId, status: 'registered' }
                        │
            cron-scheduler.ts
            │ start() → setInterval(tick, 60000)
            │
            │ tick() 매분 실행:
            │   for each cron:
            │     if (now - lastRunAt >= intervalMs):
            │       processChat(
            │         userId: `cron:${cronId}`,
            │         sessionId: cron.sessionId,
            │         prompt: cron.prompt,
            │         wdkContext, openclawClient
            │       )
            │       store.updateCronLastRun(cronId, now)
            │
            │ processChat → OpenClaw → tool_call(s) → Case 1/2/3
```

---

## Case 10: daemon ↔ Relay WebSocket 연결 + 재연결

```
            [daemon] relay-client.ts
            │ connect(url, token)
            │ → WS 연결
            │ → authenticate: { type: 'authenticate', payload: { token, lastStreamId } }
            │ → heartbeat: { type: 'heartbeat' } 매 25초
            │
            [Relay] ws.ts
            │ 1. verifyToken(token) → userId
            │ 2. bucket.daemon = socket
            │ 3. SET online:{userId} EX 30 (heartbeat)
            │ 4. stream polling 시작 (control:{userId})
            │
            [연결 끊김 발생]
            │
            [daemon] relay-client.ts
            │ exponential backoff: 1s → 2s → 4s → ... → 30s (max)
            │ jitter 추가
            │ 재연결 시: lastStreamId 전송 → 누락 메시지 수신
            │
            [Relay] ws.ts
            │ 새 소켓으로 bucket.daemon 교체
            │ lastStreamId부터 stream resume
```

---

## Case 11: RN App ↔ Relay 통신

```
            [RN App] RelayClient.ts
            │
            │ Foreground: WebSocket 연결
            │   → authenticate({ token, lastStreamId })
            │   → heartbeat 매 25초
            │   → 실시간 메시지 수신
            │
            │ Background: 앱 닫힘
            │   → WS 끊김
            │   → Relay가 메시지를 Redis Stream에 보관
            │   → 푸시 알림 발송 (Expo Push, wake-up 용)
            │
            │ 앱 다시 열림:
            │   → WS 재연결
            │   → lastStreamId 전송
            │   → 누락 메시지 일괄 수신 (cursor 동기화)
```

---

## Case 12: tx 승인 거부 (사용자)

```
            RN App: TxApprovalContext
            │ state: pending → reject() 호출
            │ → relayClient.sendApproval()는 호출하지 않음
            │ → 로컬에서만 Promise reject
            │ → queue에서 제거, 다음 pending으로 이동
            │
            daemon 측:
            │ broker.waitForApproval() → 60초 후 ApprovalTimeoutError
            │ → ExecutionFailed 이벤트
            │ → tool result: { status: 'approval_timeout' }
```

---

## Case 13: daemon 재시작 후 복구

```
            daemon 프로세스 종료 → 재시작
                        │
            index.ts
            │ 1. loadConfig()
            │ 2. initWDK():
            │    → store = new SqliteApprovalStore(dbPath)
            │    → store.getActiveSeed() → mnemonic
            │    → createGuardedWDK({ seed, approvalStore: store })
            │    → store에서 policy 로드 → 런타임 반영
            │ 3. Relay 재연결 (lastStreamId → 누락 메시지 수신)
            │ 4. CronScheduler.start():
            │    → store.listCrons() → 모든 cron 재등록
            │    → lastRunAt 기반으로 중복 실행 방지
            │ 5. ExecutionJournal.recover():
            │    → store에서 journal entries 로드
            │    → in-memory dedupe 맵 복구
            │
            복구 완료. pending approval은 보존됨.
            owner가 RN App에서 재승인 가능.
```

---

## Case 14: 중복 tx 실행 방지

```
            같은 intent가 2번 도착 (Relay 재전송 등)
                        │
            tool-surface.ts
            │ 1차: canonical.intentHash(tx) → hash_abc
            │      journal.isDuplicate(hash_abc) → false
            │      → 정상 실행 → journal.track(intentId, meta) → status: 'received'
            │      → 성공 시 journal.updateStatus(intentId, 'settled', txHash)
            │
            │ 2차: canonical.intentHash(tx) → hash_abc
            │      journal.isDuplicate(hash_abc) → true (이미 broadcasted)
            │      → 즉시 반환: { status: 'duplicate', intentHash }
            │      → tx 실행하지 않음
```

---

## Case 15: transfer (토큰 전송)

```
            OpenClaw: tool_call { name: 'transfer', args: { chain, to, token, amount } }
                        │
            tool-surface.ts
            │ 1. canonical.intentHash({ chain, to, token, amount })
            │ 2. journal.isDuplicate(hash) → false
            │ 3. wdk.getAccount(chain, 0)
            │ 4. account.transfer({ to, token, amount })
            │    → guarded-middleware: policy 평가 (Case 1/2/3과 동일 흐름)
            │ 5. journal.track(intentId, meta) → 'received'
            │ 6. 성공 시 journal.updateStatus(intentId, 'settled', txHash)
            ⇐ { status: 'executed', hash, fee, chain }
```

---

## Case 16: getBalance (잔고 조회)

```
            OpenClaw: tool_call { name: 'getBalance', args: { chain, token? } }
                        │
            tool-surface.ts
            │ 1. wdk.getAccount(chain, 0)
            │ 2. account.getBalance(token)
            │    → 읽기 전용: policy 평가 불필요
            ⇐ { balance, token, chain }
```

---

## Case 17: policyList (등록된 policy 목록)

```
            OpenClaw: tool_call { name: 'policyList', args: { chain? } }
                        │
            tool-surface.ts
            │ 1. store.loadPolicy(seedId, chain) 또는 전체 chain 순회
            ⇐ { policies: [...] }
```

---

## Case 18: policyPending (대기 중인 policy 요청)

```
            OpenClaw: tool_call { name: 'policyPending', args: {} }
                        │
            tool-surface.ts
            │ 1. broker.getPending(seedId, 'policy', null)
            ⇐ { pending: [...] }
```

---

## Case 19: listCrons (cron job 목록)

```
            OpenClaw: tool_call { name: 'listCrons', args: {} }
                        │
            tool-surface.ts
            │ 1. store.listCrons(seedId)
            ⇐ { crons: [...] }
```

---

## Case 20: removeCron (cron job 삭제)

```
            OpenClaw: tool_call { name: 'removeCron', args: { cronId } }
                        │
            tool-surface.ts
            │ 1. store.removeCron(cronId)
            │ 2. cronScheduler.remove(cronId)
            ⇐ { status: 'removed', cronId }
```

---

## ~~보안 경계 요약 (설계 기준 — 현재 코드와 차이 있음. 아래 "현재 코드 기준" 표 참조)~~

```
┌─────────────────────────────────────────────────────────┐
│              보안 경계 지도 (설계 의도)                     │
│                                                         │
│  [AI/OpenClaw]                                          │
│   │ tool_call만 가능                                     │
│   │ seed 접근 ❌ (chmod 600)                             │
│   │ admin tool 접근 ❌ (미등록)                           │
│   │ 서명 불가 ❌ (identity key 없음)                      │
│   ▼                                                     │
│  [daemon] ─────────── 핵심 신뢰 경계 ──────────          │
│   │ seed 보유 ✅ (in-memory)                             │
│   │ 검증 수행 ✅ (WDK 내부)                              │
│   │ countersign ✅                                      │
│   │ 혼자 승인 ❌ (identity key 서명 필수)                 │
│   ▼                                                     │
│  [Relay] ─────────── 메시지 중계만 ──────────            │
│   │ payload 복호화 ❌ (E2E)                              │
│   │ 서명 불가 ❌                                         │
│   │ seed 모름 ❌                                         │
│   ▼                                                     │
│  [RN App] ─────────── 승인 권한 ──────────               │
│   │ identity key 보유 ✅ (SecureStore)                   │
│   │ 서명 발행 ✅                                         │
│   │ seed 접근 ❌                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 현재 구현 갭 분석 (Codex 검증 결과)

**아래는 설계 의도와 현재 코드의 차이. 리포트의 케이스 흐름은 설계 기준이며, 현재 코드에서 미구현/불일치인 부분을 명시.**

### Gap 1: 서명 방식 불일치 (Critical)
- **설계**: app이 canonical JSON → SHA-256 → Ed25519 서명, verifier가 동일 방식으로 검증
- **현재 코드**: app은 canonical JSON 원문에 직접 서명 (SignedApprovalBuilder.ts:223), verifier는 SHA-256 해시에 대해 검증 (approval-verifier.ts:21,52)
- **영향**: Case 2/5/6/7의 승인 흐름이 end-to-end로 성립하지 않음
- **수정 필요**: app 또는 verifier 중 하나를 맞춰야 함

### Gap 2: approval step 6 context 미전달 (Critical)
- **설계**: tx_approval 시 expectedTargetHash + currentPolicyVersion을 context로 전달
- **현재 코드**: control-handler.ts가 tx_approval/policy_approval에서 context 없이 submitApproval 호출 (line 76, 96)
- **영향**: targetHash/policyVersion 바인딩 검증이 실제로 수행되지 않음

### Gap 3: pairing 보안 검증 부재 (Critical)
- **설계**: SAS 확인 완료 후 신뢰 등록
- **현재 코드**: daemon이 pairingToken/sas를 검증하지 않고 바로 trusted에 등록 (control-handler.ts:187). 단, Relay JWT 인증은 통과해야 하므로 "누구든"이 아니라 "유효한 Relay JWT를 가진 클라이언트"가 전제
- **영향**: JWT를 가진 클라이언트가 pairingToken/sas 없이 trusted approver 등록 가능

### Gap 4: policy/device approval ack 부재 (High)
- **설계**: app이 policy 승인 후 결과 수신
- **현재 코드**: daemon이 handleControlMessage 반환값을 Relay로 돌려보내지 않음 (index.ts:66). approval_result는 tx/transfer background completion에서만 전송
- **영향**: Case 5/6/7에서 app이 승인 완료를 알 수 없음

### Gap 5: pending 알림 경로 없음 (High)
- **설계**: approval 요청 / policy 요청이 App에 실시간 표시
- **현재 코드**: WDK 이벤트를 Relay로 forward하는 코드 없음. daemon이 Relay로 보내는 control 메시지는 approval_result/approval_error뿐
- **영향**: App의 Approval/Policy/Activity 탭이 실시간 업데이트 안 됨

### Gap 6: reconnect cursor 미구현 (Medium)
- **설계**: lastStreamId 전송 → 누락 메시지 resume
- **현재 코드**: (1) daemon은 lastStreamId를 보내지 않음. (2) app이 보낸 lastStreamId를 Relay가 읽지 않음. (3) Relay polling은 항상 '$'에서 시작 (control만, chat은 polling 안 함). (4) chat backlog replay 없음
- **영향**: 재연결 시 control/chat 양쪽 메시지 유실 가능

### Gap 7: daemon이 JsonApprovalStore 사용 (Medium)
- **설계**: SqliteApprovalStore
- **현재 코드**: wdk-host.ts에서 JsonApprovalStore 사용 (line 46)
- **영향**: Case 13의 "SqliteApprovalStore(dbPath)" 서술이 부정확

### ~~Gap 8: 나머지 6개 tool 케이스 누락 (Medium)~~ ✅ 해결됨
- **문서화된 tool**: sendTransaction, policyRequest, registerCron
- **추가된 tool**: transfer (Case 15), getBalance (Case 16), policyList (Case 17), policyPending (Case 18), listCrons (Case 19), removeCron (Case 20)
- **문서 추가 완료**: 6개 tool 케이스 모두 Case 15~20으로 문서화

### Gap 9: manifest schema 불일치 (Medium)
- **설계**: manifest의 PolicyPermission이 guarded-wdk permission과 호환
- **현재 코드**: manifest의 `PolicyPermission`(`address`, `argsConditions`, `constraints`)이 guarded-wdk의 permission(`target`, `args`, `valueLimit`)과 필드명/구조가 다름 (manifest/types.ts vs guarded-middleware.ts)
- **영향**: manifest → policy 변환에 번역 레이어가 추가로 필요. DeFi CLI 미구현이라 런타임 영향은 없음

### Gap 10: app executor가 모든 요청을 tx로 서명 (Critical)
- **설계**: policy/policy_reject/device_revoke 각각 다른 SignedApprovalBuilder 메서드 호출
- **현재 코드**: AppProviders.tsx의 전역 executor가 request type을 무시하고 항상 `SignedApprovalBuilder.forTx()` 호출 (line 19)
- **영향**: Case 5/6/7에서 policy/device 승인이 올바른 type으로 서명되지 않음

### Gap 11: E2E 세션 미수립 (Critical)
- **설계**: pairing 후 ECDH shared secret → setSessionKey() → 메시지 암호화
- **현재 코드**: setSessionKey() 호출부가 없음. E2E 세션이 수립되지 않아 모든 메시지가 평문
- **영향**: 보안 경계 요약의 "Relay payload 복호화 ❌ (E2E)"가 현재 false. Relay가 payload를 볼 수 있음

### Gap 12: countersign 미구현 (High)
- **설계**: policy 승인 시 WDK seed로 countersign
- **현재 코드**: updatePolicies()는 in-memory snapshot + store 갱신만 수행. countersign 로직 없음 (guarded-wdk-factory.ts:140)
- **영향**: 보안 경계의 "daemon countersign ✅"이 현재 false

### ~~Gap 13: journal API 불일치 (Medium)~~ ✅ 해결됨
- **설계**: journal.track(intentId, meta) → 'received', journal.updateStatus(intentId, 'settled', txHash)
- **현재 코드**: journal.track()은 'received'로 저장 (execution-journal.ts:99), 성공 시 updateStatus(..., 'settled')로 갱신 (tool-surface.ts:261)
- **문서 정정 완료**: Case 1/14의 journal 서술을 실제 API에 맞게 수정

### Gap 14: broker emitter 미설정 (Medium)
- **설계**: broker가 PolicyApplied, PendingPolicyRequested 등 이벤트 emit
- **현재 코드**: wdk-host.ts에서 emitter 없이 broker 생성 (line 66)
- **영향**: Policy/approval 이벤트가 발생하지 않아 Activity 탭 업데이트 불가

### ~~Gap 15: Case 6 ApprovalRejected 이벤트 미구현 (Low)~~ ✅ 해결됨
- **설계**: policy 거부 시 ⚡ ApprovalRejected
- **구현 완료**: signed-approval-broker.ts의 policy_reject case에 `emit('ApprovalRejected', { type, requestId, timestamp })` 추가

### Gap 16: Pairing auth mismatch (Critical)
- **설계**: app이 QR 스캔 → Relay 연결 → pairing_confirm 전송
- **현재 코드**: PairingService.ts가 JWT 없이 WS authenticate 시도하지만, Relay ws.ts가 유효 JWT를 강제. 설계대로면 pairing 완료 불가
- **영향**: Case 8 전체가 현재 코드에서 성립하지 않음

### Gap 17: stored policy restore mismatch (High)
- **설계**: daemon 재시작 시 store에서 policy 로드 → 런타임 반영
- **현재 코드**: daemon이 empty wallet map으로 createGuardedWDK() 호출. factory의 stored policy load는 wallet keys 기준이라 empty면 아무것도 로드 안 됨
- **영향**: Case 13의 policy 복구가 현재 boot path에서 작동하지 않음

### Gap 18: device list sync 경로 없음 (High)
- **설계**: App Settings에서 paired device 목록 조회
- **현재 코드**: daemon의 device_list는 admin socket 명령뿐 (admin-server.ts). Relay control channel 경유 경로 없음. App은 control에서 device_list를 기대하지만 daemon이 보내지 않음
- **영향**: Settings 탭에서 device 목록 표시 불가

### Gap 19: dashboard sync 경로 없음 (High)
- **설계**: App Dashboard에서 잔고/포지션 조회
- **현재 코드**: App이 request_balances를 control로 보내고 balance_update/position_update를 기다리지만, daemon control-handler에 해당 경로 없음
- **영향**: Dashboard 탭 데이터 표시 불가

### ~~Gap 20: chat streaming/error 미소비 (Medium)~~ ✅ 해결됨
- **설계**: daemon이 typing/stream/done/error 전송, App이 스트리밍 표시
- **구현 완료**: ChatScreen.tsx에 typing (인디케이터 표시), stream (delta append), error (에러 메시지 표시), done (스트림 종료) 핸들러 추가

### ~~Gap 21: chmod 600 미구현 (Medium)~~ ✅ 해결됨
- **설계**: daemon이 DB 파일 + admin socket에 chmod 600 설정
- **구현 완료**: JsonApprovalStore에 chmodSync(dir, 0o700), SqliteApprovalStore에 chmodSync(dbPath, 0o600), admin-server.ts에 chmodSync(socketPath, 0o600) 추가

### Gap 22: app sendApproval resolver mismatch (High)
- **설계**: policy/device approval 후 app이 결과 수신
- **현재 코드**: app sendApproval()은 approval_result/approval_error만 resolve/reject 조건으로 봄. daemon은 policy_approval/device_revoke를 그 형태로 보내지 않음. 양쪽 모두 수정 필요
- **영향**: Gap 4와 결합하여 policy/device 승인이 app에서 완료되지 않음

---

## 보안 경계 요약 (현재 코드 기준 주석 포함)

```
┌─────────────────────────────────────────────────────────┐
│                    보안 경계 지도                          │
│                                                         │
│  [AI/OpenClaw]                                          │
│   │ tool_call만 가능 ✅ (구현됨)                          │
│   │ seed 접근 ❌ (chmod 600) ⚠️ (운영 가정, 코드 미설정)   │
│   │ admin tool 접근 ❌ (미등록) ✅ (구현됨)                │
│   │ 서명 불가 ❌ (identity key 없음) ✅ (구현됨)           │
│   ▼                                                     │
│  [daemon]                                               │
│   │ seed 보유 ✅ (in-memory) ✅ (구현됨)                  │
│   │ 검증 수행 ✅ (WDK 내부) ⚠️ (step 6 context 미전달)    │
│   │ countersign ⚠️ (미구현)                              │
│   │ 혼자 승인 ❌ ⚠️ (step 6 미작동으로 약화됨)            │
│   ▼                                                     │
│  [Relay]                                                │
│   │ payload 복호화 ❌ (E2E) ⚠️ (E2E 세션 미수립)          │
│   │ 서명 불가 ❌ ✅ (구현됨)                               │
│   │ seed 모름 ❌ ✅ (구현됨)                               │
│   ▼                                                     │
│  [RN App]                                               │
│   │ identity key 보유 ✅ (SecureStore) ✅ (구현됨)         │
│   │ 서명 발행 ✅ ⚠️ (항상 forTx만 호출)                   │
│   │ seed 접근 ❌ ✅ (구현됨)                               │
└─────────────────────────────────────────────────────────┘
```

---

**작성일**: 2026-03-19 KST
**검증**: Codex (gpt-5.4) 5회 리뷰 완료. Gap 22개 확정. "새로운 큰 Gap이 더 남아있지 않다" (Codex 4차 판정).
