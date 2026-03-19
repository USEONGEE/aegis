# 설계 - v0.1.5

## 변경 규모
**규모**: 서비스 경계
**근거**: 4개 패키지 (guarded-wdk, daemon, relay, app) 동시 수정. cross-package 인터페이스 정합성 수정.

---

## 문제 요약
22개 Gap + ChainPolicies 이중 관리. 설계 의도와 현재 코드의 불일치 해소.

> 상세: [README.md](README.md) 참조

## 접근법
각 Gap에 대해 최소 수정. 새 기능 추가 아닌 "빠진 코드 연결". Critical → High → Medium → Low 순서.

## 대안 검토
N/A: 각 Gap의 수정 방향은 이미 사용자와 합의 완료. 설계 선택지가 있었던 건:
- 서명 방식 → SHA-256 해시에 서명 (확정)
- Store 기본값 → SqliteStore (확정)
- 이벤트 전달 → WDK 이벤트 그대로 relay (확정)
- 데이터 조회 → AI tool로 (확정)

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| 서명 방식 | SHA-256(canonicalJSON) → Ed25519 서명 | 암호학 표준, 고정 32바이트 |
| 이벤트 전달 | 12종 이벤트명 배열 등록 → relay.send | primitive, 별도 프로토콜 없음 |
| 데이터 조회 | event_stream 구독 + chat 요청 | 별도 control 타입 불필요 |
| Store 기본값 | SqliteApprovalStore | WAL mode, 쿼리 가능 |
| ChainPolicies | store = source of truth, 메모리 = 캐시 | boot hydrate + write-through |

---

## 18 Step 수정 방안

### Step 1: 서명 방식 통일 (Gap 1, Critical)

**수정 파일**: `packages/app/src/core/approval/SignedApprovalBuilder.ts`

```
현재: canonicalJSON(payload) → Ed25519.sign(jsonBytes)
수정: canonicalJSON(payload) → SHA-256(jsonBytes) → Ed25519.sign(hashBytes)
```

verifier(approval-verifier.ts)는 이미 SHA-256 해시에 대해 검증하므로 수정 불필요.

### Step 2: approval context 전달 (Gap 2, Critical)

**수정 파일**: `packages/daemon/src/control-handler.ts`

```typescript
// tx_approval — expectedTargetHash는 pending request(서버 상태)에서 가져옴 (client payload 재사용 금지)
// 새 store API 필요: loadPendingByRequestId(requestId) → PendingRequest | null
const pending = await store.loadPendingByRequestId(signedApproval.requestId)
broker.submitApproval(signedApproval, {
  expectedTargetHash: pending.targetHash,  // 서버 측 저장값
  currentPolicyVersion: await store.getPolicyVersion(seedId, chain)
})

// policy_approval — 마찬가지로 서버 측 pending에서
const pending = await store.loadPendingByRequestId(signedApproval.requestId)
broker.submitApproval(signedApproval, {
  expectedTargetHash: pending.targetHash
})
```

### Step 3: pairing 보안 (Gap 3+16, Critical)

**수정 파일**: `packages/daemon/src/control-handler.ts`, `packages/app/src/core/crypto/PairingService.ts`, `packages/relay/src/routes/auth.ts`

- daemon: pairingToken 검증 + SAS 확인 후에만 trusted에 등록
- app: pairing 전에 먼저 Relay에 register/login → JWT 획득 → WS 연결
- relay: pairing 전용 임시 토큰 발급 API 추가 (optional)

### Step 4: app executor type 분기 (Gap 10, Critical)

**수정 파일**: `packages/app/src/app/providers/AppProviders.tsx`

```typescript
// 현재: 항상 forTx()
// 수정: request.type에 따라 분기
switch (request.type) {
  case 'tx': return SignedApprovalBuilder.forTx(...)
  case 'policy': return SignedApprovalBuilder.forPolicy(...)
  case 'policy_reject': return SignedApprovalBuilder.forPolicyReject(...)
  case 'device_revoke': return SignedApprovalBuilder.forDeviceRevoke(...)
}
```

### Step 5: E2E 세션 수립 (Gap 11, Critical)

**수정 파일**: `packages/daemon/src/control-handler.ts`, `packages/app/src/core/crypto/PairingService.ts`

- pairing 완료 시 ECDH shared secret 계산
- daemon: `relayClient.setSessionKey(sharedSecret)`
- app: `RelayClient.setSessionKey(sharedSecret)`
- 이후 모든 메시지 자동 암호화

### Step 6: approval ack (Gap 4+22, High)

**수정 파일**: `packages/daemon/src/control-handler.ts`, `packages/daemon/src/index.ts`

- handleControlMessage 반환값을 relay로 전송
- policy_approval → `{ type: 'approval_result', requestId, ok: true }`
- device_revoke → `{ type: 'approval_result', requestId, ok: true }`

### Step 7: WDK 이벤트 relay (Gap 5+14, High)

**수정 파일**: `packages/daemon/src/wdk-host.ts`, `packages/daemon/src/index.ts`

- wdk-host: broker 생성 시 emitter 전달
- index.ts: 지원 이벤트명 배열로 루프 등록
```typescript
const RELAY_EVENTS = [
  'IntentProposed', 'PolicyEvaluated', 'ApprovalRequested', 'ApprovalGranted',
  'ExecutionBroadcasted', 'ExecutionSettled', 'ExecutionFailed',
  'PendingPolicyRequested', 'ApprovalVerified', 'ApprovalRejected', 'PolicyApplied', 'DeviceRevoked'
]
for (const eventName of RELAY_EVENTS) {
  wdk.on(eventName, (event) => relay.send('control', { type: 'event_stream', eventName, event }))
}
```

### Step 8: stored policy restore (Gap 17, High)

**수정 파일**: `packages/daemon/src/wdk-host.ts`

- 새 store API 필요: `listPolicyChains(seedId) → string[]` (policy가 저장된 chain 목록)
- boot 시 store에서 등록된 chain 목록 조회
- 각 chain에 대해 store.loadPolicy() → createGuardedWDK config에 반영

### Step 9: device list + balance + position (Gap 18+19, High)

**수정 파일**: `packages/app/src/domains/dashboard/screens/DashboardScreen.tsx`, `packages/app/src/domains/settings/screens/SettingsScreen.tsx`

app 화면을 chat 결과 기반으로 재설계:
**데이터 경로 (단일화)**:
- Dashboard (잔고/포지션): event_stream의 `ExecutionSettled`/`ExecutionBroadcasted` → zustand 갱신. 수동 새로고침 시 chat으로 "잔고 조회" → AI tool(getBalance) 결과 → zustand 갱신.
- Settings (device list): chat으로 "내 디바이스 목록" → AI tool 결과 → zustand 갱신.
- **공통 패턴**: chat 결과를 zustand에 normalize. 별도 control 메시지 타입 안 만듦. wdk-admin 경유 안 함.

### Step 10: reconnect cursor (Gap 6, Medium)

**수정 파일**: `packages/daemon/src/relay-client.ts`, `packages/relay/src/routes/ws.ts`

- daemon: authenticate 시 lastStreamId 전송
- relay: lastStreamId가 있으면 해당 ID부터 stream 읽기 ($ 대신)
- chat stream도 polling 대상에 추가

### Step 11: SqliteStore 기본값 (Gap 7, Medium)

**수정 파일**: `packages/daemon/src/wdk-host.ts`

```typescript
// 현재: new JsonApprovalStore(...)
// 수정: new SqliteApprovalStore(...)
```

### Step 12: manifest schema 정합 (Gap 9, Medium)

**수정 파일**: `packages/manifest/src/types.ts`, `packages/manifest/src/manifest-to-policy.ts`

- PolicyPermission 필드명을 WDK Permission과 일치 (target, args, valueLimit)
- v0.1.4에서 permissions 딕셔너리로 바뀌면 그에 맞게 조정

### Step 13: journal API 정합 (Gap 13, Medium)

**수정**: 문서 수정만. `docs/report/system-interaction-cases.md`의 journal 서술을 실제 API에 맞게 정정.

### Step 14: chat streaming 소비 (Gap 20, Medium)

**수정 파일**: `packages/app/src/domains/chat/screens/ChatScreen.tsx`

- `typing` → 타이핑 인디케이터 표시
- `stream` → delta를 실시간으로 메시지에 append
- `error` → 에러 메시지 표시

### Step 15: chmod 600 (Gap 21, Medium)

**수정 파일**: `packages/guarded-wdk/src/json-approval-store.ts`, `packages/guarded-wdk/src/sqlite-approval-store.ts`, `packages/daemon/src/admin-server.ts`

```typescript
import { chmodSync } from 'node:fs'
// DB 파일 생성 후
chmodSync(dbPath, 0o600)
// admin socket 생성 후
chmodSync(socketPath, 0o600)
```

### Step 16: 나머지 tool 케이스 문서화 (Gap 8, Medium)

**수정**: `docs/report/system-interaction-cases.md`에 transfer, getBalance, policyList, policyPending, listCrons, removeCron 케이스 추가.

### Step 17: ApprovalRejected 이벤트 (Gap 15, Low)

**수정 파일**: `packages/guarded-wdk/src/signed-approval-broker.ts`

```typescript
// policy_reject case에 추가
if (this._emitter) {
  this._emitter.emit('ApprovalRejected', { type: 'ApprovalRejected', requestId, timestamp: Date.now() })
}
```

### Step 18: ChainPolicies → store 캐시 통합

**수정 파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`

- boot: `store.loadPolicy(seedId, chain)` → 메모리 캐시 hydrate
- updatePolicies: `store.savePolicy()` → 메모리 캐시 갱신 (write-through)
- ChainPolicies 타입은 factory 내부 캐시로만 사용
- createGuardedWDK()의 `policies` 파라미터: optional 초기값으로 유지 (store가 비어있을 때만 사용). store에 policy가 있으면 store 우선
- 외부 API 변경: `policies`를 required → optional로 격하

---

## 테스트 전략

- Critical step (1~5): 각각 새 테스트 추가 (서명 round-trip, context 전달 검증, pairing 흐름, executor 분기, E2E 암호화)
- High step (6~9): 통합 테스트 (approval ack 수신, 이벤트 forward, policy restore, tool 조회)
- Medium step (10~15): 단위 테스트 또는 기존 테스트 수정
- 기존 242 테스트 유지

## 보안/권한

- Step 1: 서명 방식 통일로 실제 검증이 작동
- Step 3: pairing 보안 강화 (SAS + JWT)
- Step 5: E2E 세션 수립으로 Relay blind transport 실현
- Step 15: chmod 600으로 OS 수준 격리

## 범위 / 비범위
N/A: README.md 참조.

## 가정/제약
N/A: README.md 참조.

## 아키텍처 개요
N/A: 기존 아키텍처 유지. 빠진 코드 연결만. `docs/report/architecture-and-user-flow-summary.md` 참조.

## 데이터 흐름
N/A: 기존 Flow A~F 유지. `docs/report/system-interaction-cases.md` 참조.

## API/인터페이스 계약
새 store API 2개:
- `loadPendingByRequestId(requestId: string): Promise<PendingRequest | null>` — requestId로 pending 조회
- `listPolicyChains(seedId: string): Promise<string[]>` — policy가 저장된 chain 목록

나머지 인터페이스는 기존 PRD 계약 유지.

## 데이터 모델/스키마
N/A: 스키마 변경 없음. v0.1.4에서 처리.

## Ownership Boundary
N/A: 기존 6패키지 역할 유지. `docs/phases/v0.1.0-wdk-app-platform/design.md` Ownership 참조.

## Contract Reference
N/A: PRD 계약 유지.

## Dependency Map
N/A: 기존 의존 방향 유지.

## 실패/에러 처리
각 Step의 에러 처리는 해당 Step 설명에 포함.

## 성능/스케일
N/A: 성능 변경 없음.

## 롤아웃/롤백
N/A: v0.1.4 완료 후 순차 적용. 저장 포맷 reset 허용.

## 관측성
Step 7 (이벤트 relay)로 개선됨. 12종 이벤트가 app Activity 탭에 실시간 표시.

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| v0.1.4 미완료 시 Step 12 (manifest schema) 충돌 | medium | v0.1.4 완료 후 진행 |
| E2E 세션 수립 (Step 5)이 pairing (Step 3) 의존 | 순서 강제 | 의존성 명시 |
| chat streaming (Step 14)이 Metro bundler 의존 | RN 테스트 어려움 | 코드 검사 + expo export |
