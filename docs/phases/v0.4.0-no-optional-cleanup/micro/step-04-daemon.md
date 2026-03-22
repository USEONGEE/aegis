# Step 04: daemon 내부 타입 + deps 객체 패턴

## 메타데이터
- **난이도**: 🟠 높은 보통 (deps 객체 패턴, AdminRequest DU, ControlResult cascade 수신)
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (ControlResult DU, RelayEnvelope required+null), Step 02 (guarded-wdk 타입 확정)
- **위반 ID**: #31~#42 (총 12건)
- **DoD 항목**: F9, F10, F11, F12, N1, N2, E1, E2

---

## 1. 구현 내용 (design.md 기반)

### #31~#32 `QueuedMessage.chainId?/cronId?` -- Wide Bag (2건)
- `chainId?: number` -> `chainId: number | null`
- `cronId?: string` -> `cronId: string | null`
- `index.ts`의 `queueManager.enqueue()` 호출부에서 `chainId: chainId ?? null`, `cronId: cronId ?? null` 명시

### #33~#34 `CancelResult.reason?/wasProcessing?` -- DU 미적용 (2건)
- 단일 interface를 DU로 분리:
  - `CancelResultOk`: `{ ok: true, wasProcessing: boolean }`
  - `CancelResultFailed`: `{ ok: false, reason: 'not_found' | 'already_completed' }`
- `cancelQueued()`, `cancelActive()` 반환부 수정
- `control-handler.ts`에서 `cancelResult` 접근 시 narrowing 적용

### #35~#37 `handleControlMessage` Optional Deps (3건)
- optional 파라미터 3개 (`relayClient?`, `approvalStore?`, `queueManager?`)를 `ControlHandlerDeps` 객체로 통합:
```ts
export interface ControlHandlerDeps {
  broker: SignedApprovalBroker
  logger: Logger
  approvalStore: InstanceType<typeof SqliteApprovalStore>
  queueManager: MessageQueueManager
}
```
- `relayClient?`는 dead code이므로 제거
- 함수 시그니처: `handleControlMessage(msg, deps)` -- 2개 파라미터
- `index.ts`에서 deps 객체를 구성하여 전달

### #38~#39 `ChainArgs.accountIndex?` / `CronIdArgs.accountIndex?` -- Default 대신 Optional (2건)
- `accountIndex?: number` -> `accountIndex: number` (required)
- AI tool schema에서도 required로 변경
- 호출부에서 `0` 명시

### #40~#41 `JournalEntry.chainId?/txHash?` -- Wide Bag / DU 미적용 (2건)
- `chainId?: number` -> `chainId: number` (required, tx 실행 시 항상 존재)
- `txHash?: string | null` -> `txHash: string | null` (required)
- `execution-journal.ts`의 `addEntry()` 호출부에서 값 명시

### #42 `AdminRequest/AdminResponse` Wide Bag (1건, 5 optional 필드)
- `AdminRequest` -- command별 DU:
  - `{ command: 'status' }`
  - `{ command: 'journal_list'; status: string | null; chainId: number | null; limit: number }`
  - `{ command: 'signer_list' }`
  - `{ command: 'cron_list' }`
  - `{ command: 'wallet_list' }`
- `AdminResponse` -- ok/error DU:
  - `AdminResponseOk: { ok: true; data: Record<string, unknown> }`
  - `AdminResponseError: { ok: false; error: string }`
- `[key: string]: unknown` index signature 제거

## 2. 완료 조건
- [ ] `message-queue.ts`에서 `QueuedMessage` 위반 대상 `?:` 0건 (정당한 `MessageQueueOptions` 제외)
- [ ] `message-queue.ts`에서 `CancelResult`가 `CancelResultOk | CancelResultFailed` DU
- [ ] `control-handler.ts`에서 `handleControlMessage` optional params 0개, `ControlHandlerDeps` 객체 패턴 적용
- [ ] `control-handler.ts`에서 `relayClient` 파라미터 제거 (dead code)
- [ ] `control-handler.ts`에서 ControlResult DU variant별 올바른 리터럴 반환 (Step 01 cascade 수신)
- [ ] `tool-surface.ts`에서 `accountIndex?` 0건
- [ ] `execution-journal.ts`에서 `JournalEntry` 위반 대상 `?:` 0건
- [ ] `admin-server.ts`에서 `AdminRequest/AdminResponse` 위반 대상 `?:` 0건
- [ ] daemon 패키지 `tsc --noEmit` 통과
- [ ] daemon 테스트 전체 통과 (control-handler, message-queue, tool-surface, execution-journal)
- [ ] `control-handler.test.ts`에서 ControlResult assertion이 DU variant와 일치
- [ ] `control-handler.test.ts`에서 deps 객체 전달 패턴으로 수정
- [ ] `index.ts`에서 deps 객체 구성 코드 추가

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/
│   ├── message-queue.ts              # #31~#34: QueuedMessage required+null, CancelResult DU
│   ├── control-handler.ts            # #35~#37: ControlHandlerDeps 객체 패턴 + ControlResult DU cascade 수신
│   ├── tool-surface.ts               # #38~#39: ChainArgs/CronIdArgs accountIndex required
│   ├── execution-journal.ts          # #40~#41: JournalEntry chainId/txHash required
│   ├── admin-server.ts               # #42: AdminRequest DU, AdminResponse DU
│   ├── ai-tool-schema.ts             # accountIndex required 반영 (tool schema)
│   ├── index.ts                      # deps 객체 구성 + enqueue 호출부 null 명시
│   ├── ports.ts                      # CreateRequestOptions 동기화 (Step 02 cascade)
│   └── wdk-host.ts                   # GuardedWDKConfig 호출부 수정 (Step 02 cascade)
└── tests/
    ├── control-handler.test.ts       # ControlResult assertion + deps 객체 전달 수정
    ├── message-queue.test.ts         # CancelResult assertion + QueuedMessage fixture 수정
    ├── tool-surface.test.ts          # ChainArgs fixture 수정
    └── execution-journal.test.ts     # JournalEntry fixture 수정
```

### 의존성 분석

**upstream** (Step 01, 02에서 확정):
- `ControlResult` DU (Step 01) -> `control-handler.ts` 반환 타입이 DU variant와 일치해야 함
- `RelayEnvelope` required+null (Step 01) -> `relay-client.ts` envelope 구성 시 null 명시
- `VerificationContext` required+null (Step 02) -> `control-handler.ts` 호출부에서 null 명시
- `saveSigner`, `updateJournalStatus` 시그니처 (Step 02) -> `execution-journal.ts` 호출부 수정
- `GuardedWDKConfig` (Step 02) -> `wdk-host.ts` 호출부 수정
- `CreateRequestOptions` (Step 02) -> `ports.ts` 동기화
- `getAccount(index)` (Step 02) -> `tool-surface.ts` 호출부 수정

**downstream**:
- daemon 내부 타입 변경은 relay/app에 직접 cascade 없음 (daemon은 relay/app의 upstream이 아님)
- 단, `relay-client.ts`의 envelope 구성은 `RelayEnvelope` 타입 변경에 의한 것 (Step 01 cascade)

### Side Effect 위험
- **ControlResult DU cascade**: control-handler.ts의 모든 case 분기에서 반환 리터럴이 정확한 variant와 일치해야 함. tsc narrowing으로 검증.
- **handleControlMessage deps 객체**: 테스트 fixture 전면 수정 필요. 기존 positional args -> 객체 패턴.
- **AdminRequest DU**: admin-server 내부 타입이므로 외부 영향 없음. HTTP API의 요청 body 파싱 로직 수정 필요.
- **accountIndex required**: AI tool schema 변경 시 OpenClaw API 호출에 영향. 기존 tool call에서 accountIndex를 생략하던 케이스가 있으면 에러.

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 다음: [Step 05: relay 타입 정리](step-05-relay.md)
