# WDK-APP 최종 아키텍처 및 유저 플로우 총정리

> PRD 확정 후 검증용. 전체 구조, 컴포넌트 역할, 데이터 흐름, 보안 모델을 한 문서에 정리.

---

## 1. 시스템 전체 구조

### 3-tier (RN App ↔ Relay ↔ 개인 서버)

```
┌──────────────────┐          ┌───────────────────┐          ┌──────────────────────────────┐
│ RN App (owner 폰) │          │ Relay Server      │          │ 사용자 개인 서버 (집/VPS)       │
│                  │◄──push── │ (우리 중앙 서버)    │◄─outbound │                              │
│                  │ ──WS───► │                   │  WebSocket►│                              │
│                  │          │                   │          │  ┌────────────────────────┐   │
│  identity key    │          │  Redis Streams    │          │  │ daemon (privileged)    │   │
│  (SecureStore)   │          │  PostgreSQL       │          │  │                        │   │
│                  │          │  E2E 복호화 불가   │          │  │  Guarded WDK (library) │   │
│                  │          │                   │          │  │  seed in-memory        │   │
│                  │          │                   │          │  │  Execution Journal     │   │
│                  │          │                   │          │  │  Relay WS Client       │   │
│                  │          │                   │          │  │  OpenClaw SDK Client   │   │
│                  │          │                   │          │  └────────────────────────┘   │
│                  │          │                   │          │                              │
│                  │          │                   │          │  ┌────────────────────────┐   │
│                  │          │                   │          │  │ OpenClaw (localhost)    │   │
│                  │          │                   │          │  │ OpenAI 호환 API        │   │
│                  │          │                   │          │  │ :18789                 │   │
│                  │          │                   │          │  └────────────────────────┘   │
└──────────────────┘          └───────────────────┘          └──────────────────────────────┘
```

### 왜 이 구조인가

| 이유 | 설명 |
|------|------|
| NAT/방화벽 통과 | 개인 서버가 outbound WebSocket으로 Relay에 연결. 포트 오픈 불필요 |
| seed 격리 | DB 파일 (`wdk.db`)은 `chmod 600` privileged only. 다중 seed 관리. OpenClaw 접근 불가 |
| E2E 암호화 | Relay는 payload 복호화 불가. 라우팅 metadata만 평문 |
| 텔레그램 패턴 | 개인 서버가 오프라인이면 Relay가 큐에 적재, 온라인 시 전달 |

---

## 2. 컴포넌트별 역할

### daemon (개인 서버, privileged user)

**thin orchestration host — 핵심 신뢰 경계**

| 역할 | 설명 |
|------|------|
| WDK 호스팅 | Guarded WDK 라이브러리 import, seed in-memory |
| OpenClaw 관리 | OpenAI SDK로 통신 (localhost:18789), tool 등록, tool_call 수신 → WDK 호출 |
| Relay 브릿지 | outbound WebSocket으로 Relay에 연결, 메시지 중계 |
| countersign | SignedApproval 검증 통과 시 WDK seed로 countersign |
| Cron Scheduler | AI가 등록한 주기 작업을 interval마다 OpenClaw에 자동 전송 |
| Execution Journal | intentId 기반 중복 실행 방지 |

**하지 않는 일**: 서명 검증 (WDK), policy 평가 (WDK), AI 전략 (OpenClaw), DeFi tx 생성 (AI)

### OpenClaw (개인 서버, localhost:18789)

**AI agent. OpenAI 호환 API 제공.**

| 역할 | 설명 |
|------|------|
| 대화 | 사용자 메시지 수신 → 전략 판단 → 응답 생성 |
| tool_call | daemon이 등록한 tool (sendTransaction, policyRequest 등) 호출 |
| DeFi 지식 | ABI encode 등 DeFi 로직을 내부적으로 수행, raw calldata 생성 |

**접근 불가**: seed.txt, admin surface (tool로 등록 안 됨)

### Guarded WDK (라이브러리, daemon이 import)

**서명 엔진. DeFi 로직 없음.**

| 역할 | 설명 |
|------|------|
| policy 평가 | target + selector + args 매칭 → AUTO / REQUIRE_APPROVAL / REJECT |
| 서명 | policy 통과 시 seed로 tx 서명 |
| 승인 검증 | SignedApproval의 6단계 검증 (WDK 내부, 우회 불가) |
| countersign | policy 승인 시 WDK seed로 추가 서명 |
| 영속 저장 | ApprovalStore (JSON 또는 SQLite) |
| 이벤트 | 11종 이벤트 emit (기존 7 + 신규 4) |

### Relay Server (우리 중앙 서버)

**메시지 큐 + 라우팅. payload 복호화 불가.**

| 역할 | 설명 |
|------|------|
| 메시지 큐 | Redis Streams (chat_queue + control_channel) |
| 디바이스 레지스트리 | PostgreSQL (pairing, 라우팅 정보) |
| 인증 + 라우팅 | userId → daemon/앱 매핑 |
| 푸시 알림 | Expo Notifications (wake-up 용도) |
| 온라인 상태 | Redis Key + TTL |

**모르는 것**: seed, identity key, policy 내용, tx 내용 (E2E 암호화)

### RN App (owner 폰)

**owner 제어판. identity key 보유.**

| 역할 | 설명 |
|------|------|
| identity key | Ed25519 키페어, Expo SecureStore에 저장. 전체 보안의 루트 |
| 승인 발행 | SignedApproval 생성 (tx, policy, device 공통) |
| policy 관리 | pending 승인/거부, active 조회, manifest 기반 생성 |
| 대화 | OpenClaw와 자연어 대화 |
| 대시보드 | 잔고, 포지션, 이벤트 타임라인 |

---

## 3. Relay 큐 구조

```
Relay Server
  └─ user_123
       ├─ control_channel               ← user 스코프
       │   typed envelope:
       │   { type: 'tx_approval' | 'policy_approval' | 'policy_reject'
       │          | 'device_revoke' | 'policy_update' | 'status_sync',
       │     payload: SignedApproval,
       │     messageId, timestamp }
       │
       └─ sessions/
            └─ session_abc
                 └─ chat_queue           ← session 스코프
                     사용자 ↔ OpenClaw 대화 메시지
```

| 큐 | 스코프 | 내용 | Redis |
|----|--------|------|-------|
| control_channel | user | SignedApproval (tx/policy/device) | Streams, XREAD |
| chat_queue | session | 대화 메시지 | Streams, consumer group |

**OpenClaw 세션 매핑**: daemon이 OpenClaw API 호출 시 `user: "userId:sessionId"` 합성.

---

## 4. 유저 플로우 (전체 시나리오)

### Flow A: 최초 설정 (Pairing)

```
① 사용자: daemon 시작 (개인 서버)
   → daemon이 ApprovalStore 열기 → getActiveSeed() → mnemonic
   → createGuardedWDK({ seed: mnemonic, ... })
   → Relay에 outbound WebSocket 연결

② 사용자: RN App 설치 → pairing 시작
   → 인증된 ECDH 키 교환 (QR 코드 스캔 + SAS 확인)
   → 앱: identity key 생성 → Expo SecureStore 저장
   → daemon: 앱의 public key를 trustedApprovers에 등록
   → Relay: 디바이스 라우팅 정보 등록

③ pairing 완료
   → 앱과 daemon 사이 E2E 암호화 채널 확립
   → 이후 모든 control_channel 메시지는 E2E 암호화
```

### Flow B: AI에게 주기 작업 요청 (cron + policy AUTO)

```
① 사용자 (RN App): "Aave health factor 5분마다 감시하고 위험하면 repay해"
   → RN App → Relay (chat_queue, session_abc) → daemon

② daemon: OpenClaw API 호출
   POST localhost:18789/v1/chat/completions
   { user: "user_123:session_abc", messages: [...], tools: [agent surface] }

③ OpenClaw: 주기 작업이 필요하다고 판단
   → tool_call: { name: 'registerCron', arguments: {
       interval: '5m',
       prompt: 'Check Aave health factor. If below 1.5, repay USDC.',
       chain: 'ethereum', sessionId: 'session_abc'
     }}

④ daemon: cron 등록 (ApprovalStore에 저장) → tool result → OpenClaw
   → OpenClaw: "5분마다 감시하도록 설정했습니다." → daemon → Relay → RN App

   --- 5분 후 (cron 자동 실행) ---

⑤ daemon: cron trigger → OpenClaw API에 prompt 자동 전송
   { user: "user_123:session_abc", messages: [{ role: 'user', content: 'Check Aave...' }] }

⑥ OpenClaw: health factor 확인 필요
   → tool_call: { name: 'getBalance', arguments: { chain: 'ethereum' } }
   → daemon: WDK 호출 → 결과 반환

⑦ OpenClaw: health factor 위험 판단 → repay 결정
   → AI 내부: ABI encode → to=aavePool, data=repay(USDC, 500e6, 2, user)
   → tool_call: { name: 'sendTransaction', arguments: { chain, to, data, value: '0' } }

⑧ daemon: WDK 호출
   → policy 평가: target=aavePool, selector=0x573ade81, args[1]=500e6
   → permission 매칭: amount ≤ 1000e6 → AUTO

⑨ WDK: 서명 → 제출 → tx hash 반환
   → Execution Journal: received → evaluated → broadcasted
   → 이벤트: IntentProposed → PolicyEvaluated → ExecutionBroadcasted

⑩ daemon: tool result → OpenClaw
   { status: 'executed', hash: '0xabc...', fee: '0.003 ETH', chain: 'ethereum' }

⑪ OpenClaw: 결과 메시지 생성 → daemon → Relay → RN App
   "Aave에 500 USDC repay 완료했습니다. tx: 0xabc..."
   + 이벤트 스트림 (Activity 탭에 실시간 표시)

   --- 5분 후 다시 ⑤부터 반복 ---
```

### Flow C: AI 실행에 승인 필요 (REQUIRE_APPROVAL)

```
① ~ ⑤ Flow B와 동일 (AI가 repay 100,000 USDC 결정)

⑥ daemon: WDK 호출
   → policy 평가: amount=100000e6 → 첫 번째 rule(≤1000e6) 불일치
   → 두 번째 rule(repay, 조건 없음) → REQUIRE_APPROVAL

⑦ WDK: SignedApprovalBroker.createRequest({ type: 'tx', targetHash: intentHash })
   → 이벤트: ApprovalRequested

⑧ daemon: tool result → OpenClaw
   { status: 'pending_approval', requestId: 'req_456', message: '...' }

⑨ daemon → Relay (control_channel): 승인 요청 메시지
   → Relay → RN App 푸시 알림 (wake-up)

⑩ 사용자 (RN App): Approval 탭에서 확인
   - "Aave repay 100,000 USDC — 승인하시겠습니까?"
   - tx 상세: to, data, value, chain, 예상 가스비

⑪ 사용자: 승인 버튼
   → RN App: identity key로 SignedApproval 생성
   {
     type: 'tx',
     targetHash: intentHash,
     approver: '0x...',
     deviceId: 'iphone_abc',
     chain: 'ethereum',
     requestId: 'req_456',
     policyVersion: 3,
     expiresAt: now + 60s,
     nonce: 17,
     sig: Ed25519.sign(위 전체)
   }

⑫ RN App → Relay (control_channel) → daemon

⑬ daemon: SignedApprovalBroker.submitApproval(signedApproval)
   → WDK 내부 verifyApproval():
     1. approver ∈ trustedApprovers? ✅
     2. deviceId not revoked? ✅
     3. Ed25519.verify(sig)? ✅
     4. expiresAt > now? ✅
     5. nonce > lastNonce? ✅
     6. targetHash === intentHash? policyVersion === 3? ✅
   → Promise resolve

⑭ WDK: 서명 → 제출 → tx hash
   → Execution Journal: approved → broadcasted → settled
   → 이벤트: ApprovalVerified → ExecutionBroadcasted → ExecutionSettled

⑮ daemon: OpenClaw에 후속 결과 전달
   → OpenClaw → 사용자 응답 → Relay → RN App
```

### Flow D: AI가 policy 없어서 요청

```
① AI: tool_call { name: 'sendTransaction', ... } (borrow 시도)

② daemon → WDK: policy 평가 → REJECT (borrow에 대한 permission 없음)

③ daemon: tool result → OpenClaw
   { status: 'rejected', reason: 'no matching permission', message: '...' }

④ OpenClaw: policy가 필요하다고 판단
   → tool_call: { name: 'policyRequest', arguments: {
       chain: 'ethereum',
       reason: 'Aave borrow를 위해 필요합니다',
       policies: [{
         type: 'call',
         permissions: [{
           target: '0xAavePool',
           selector: '0xa415bcad',  // borrow
           decision: 'REQUIRE_APPROVAL'
         }]
       }]
     }}

⑤ daemon → WDK: pending policy 저장
   → 이벤트: PendingPolicyRequested

⑥ OpenClaw: 사용자 응답
   "Aave borrow를 하려면 policy 승인이 필요합니다. RN App에서 확인해주세요."

⑦ daemon → Relay (chat_queue) → RN App
   + control_channel에도 pending policy 알림

⑧ 사용자 (RN App): Policy 탭에서 pending 확인
   - "OpenClaw가 Aave borrow policy를 요청합니다"
   - 상세: target, selector, decision, AI의 이유

⑨ 사용자: 승인 (또는 수정 후 승인)
   → identity key로 SignedApproval { type: 'policy', targetHash: policyHash, ... }

⑩ RN App → Relay (control_channel) → daemon

⑪ daemon → WDK: verifyApproval() → 통과
   → WDK countersign (seed로 추가 서명)
   → ApprovalStore에 영속 저장 (policy + userSig + wdkSig)
   → updatePolicies() 런타임 반영
   → 이벤트: ApprovalVerified → PolicyApplied

⑫ OpenClaw: 다음 시도에서 borrow → policy 있음 → 실행
```

### Flow E: owner가 직접 policy 수정

```
① 사용자 (RN App): Policy 탭에서 기존 policy 수정
   - "repay AUTO 한도를 1000 → 5000으로 올리겠습니다"
   - 수정된 policy를 UI에서 편집

② RN App: identity key로 SignedApproval
   { type: 'policy', targetHash: policyHash(수정된 policy), ... }

③ RN App → Relay (control_channel) → daemon

④ daemon → WDK: verifyApproval() → 통과 → countersign → 저장 → 적용
   → 이벤트: PolicyApplied

⑤ 즉시 반영. AI의 다음 실행부터 새 한도 적용.
```

### Flow F: 디바이스 분실 → revoke

```
① 사용자: 다른 디바이스(또는 wdk-admin CLI)에서 revoke 요청
   → SignedApproval { type: 'device_revoke', targetHash: SHA-256(deviceId), ... }

② → Relay (control_channel) → daemon

③ daemon → WDK: verifyApproval() → 통과
   → ApprovalStore에서 해당 deviceId revoke 처리
   → 이벤트: DeviceRevoked

④ 이후 revoked 디바이스의 서명은 WDK가 전부 거부
   (verifyApproval 2단계: "deviceId not revoked?" → DeviceRevokedError)

⑤ daemon → Relay: 라우팅 정리 통보
```

---

## 5. 보안 모델 요약

### Unified Signed Approval

모든 승인 (tx, policy, device)이 동일한 envelope + 동일한 검증 파이프라인.

```
SignedApproval = {
  type, targetHash,
  approver, deviceId,
  chain, requestId, policyVersion,
  expiresAt, nonce,
  sig  ← Ed25519(위 전체)
}
```

### 6단계 검증 (WDK 내부)

```
1. approver ∈ trustedApprovers?
2. deviceId not revoked?
3. Ed25519.verify(sig)?
4. expiresAt > now?
5. nonce > lastNonce[approver][deviceId]?
6. type별: targetHash 일치? policyVersion 일치?
```

### 권한 분리

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ AI (OpenClaw)│     │ daemon/WDK   │     │ RN App      │
│              │     │              │     │ (owner)     │
│ 요청 ✅       │     │ 검증 + 서명   │     │ 승인 ✅      │
│ 승인 ❌       │     │ 혼자 승인 ❌  │     │ identity key│
│ seed ❌       │     │ seed 보유     │     │ SecureStore │
│ admin ❌      │     │ countersign  │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

### 공격 방어 매트릭스

| 공격 벡터 | 방어 |
|-----------|------|
| AI가 policy/tx 자가 승인 | identity key가 폰 SecureStore에만 있음 |
| AI가 seed DB 직접 읽기 | DB 파일 chmod 600 (privileged only) |
| AI가 admin tool 호출 | tool로 등록 안 됨 → 호출 방법 없음 |
| daemon이 혼자 policy 적용 | identity key 서명 필수 |
| Relay가 승인 위조 | E2E 암호화 + identity key 서명 |
| replay 공격 | expiresAt + nonce (per-approver-per-device) |
| cross-chain replay | chain 필드가 서명에 포함 |
| stale tx approval | policyVersion 바인딩 |
| revoked 디바이스 | deviceId 검증 (daemon이 truth) |
| daemon 재시작 | ApprovalStore 영속 저장 |

---

## 6. 데이터 스키마

### Unsigned Intent (tx 규격)

```javascript
{ chain: 'ethereum', to: '0x...', data: '0x...', value: '0' }
```

`intentHash = SHA-256(canonical JSON, 키 정렬, lowercase)`

### Policy Hash

```javascript
policyHash = SHA-256(JSON.stringify(
  policies.map(sortKeysDeep), null, 0
))
// address lowercase, 숫자는 decimal string
```

### Tool Result Schema

| status | 의미 | OpenClaw 행동 |
|--------|------|-------------|
| `executed` | 즉시 실행 성공 | 사용자에게 결과 보고 |
| `pending_approval` | 승인 대기 | "승인 대기 중" 알림 |
| `rejected` | policy 거부 | policyRequest tool_call |
| `error` | 실행 실패 | 에러 보고 / 재시도 |

---

## 7. 프로젝트 구조

```
WDK-APP/
  packages/
    guarded-wdk/   ← 서명 엔진 (@tetherto/wdk 포크)
    manifest/      ← policy 카탈로그 (canonicalization 공유)
    daemon/        ← orchestration host + tool surface + wdk-admin
    relay/         ← Relay Server + docker-compose (Redis + PostgreSQL)
    app/           ← RN App (Expo)
  docs/
    PRD.md
    HANDOVER.md
    openclaw-api-spec.md
```

### 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| Guarded WDK | JS (ES Modules) |
| Daemon | Node.js, OpenAI SDK |
| Relay | Node.js, Fastify, WebSocket, Redis Streams, PostgreSQL |
| RN App | React Native, Expo, zustand, Expo SecureStore |
| E2E 암호화 | ECDH + Ed25519 |
| AI | OpenClaw (OpenAI 호환 API) |

---

## 8. 개발 순서

| # | 대상 | 핵심 산출물 |
|---|------|-----------|
| 1 | Guarded WDK 코어 | ✅ 완료 (policy 평가 + 이벤트) |
| 2 | Guarded WDK 확장 | SignedApprovalBroker + ApprovalStore + approval-verifier |
| 3 | Protocol Adapter | manifest 규격 + canonicalization 공유 |
| 4 | Daemon | tool surface + Relay WS Client + Execution Journal |
| 5 | Relay Server | chat queue + control channel + docker-compose |
| 6 | RN App | pairing + SignedApproval UI + chat + dashboard |

---

**작성일**: 2026-03-18 KST
