# Step 02: guarded-wdk 내부 타입 정리

## 메타데이터
- **난이도**: 🟠 높은 보통 (store 인터페이스, factory config, broker 변경)
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (ControlResult DU, RelayEnvelope required+null 확정)
- **위반 ID**: #14~#29 (총 16건)
- **DoD 항목**: F4, F5, F6, F7, N1, N2, E3

---

## 1. 구현 내용 (design.md 기반)

### #14~#15 `VerificationContext` Wide Bag (2건)
- `currentPolicyVersion?: number` -> `currentPolicyVersion: number | null`
- `expectedTargetHash?: string` -> `expectedTargetHash: string | null`
- 호출부에서 `context: {}` -> `context: { currentPolicyVersion: null, expectedTargetHash: null }` 명시

### #16 `PendingApprovalRequest.walletName?` -- DU 미적용
- `walletName?: string` -> `walletName: string | null`
- 완전한 DU 분리는 store 인터페이스 전체 변경이 필요하므로 required+null 패턴 적용

### #17~#19 `HistoryEntry` DU 미적용 (3건)
- `requestId?: string` -> `requestId: string`
- `content?: string` -> `content: string`
- `signedApproval?: SignedApproval` -> `signedApproval: SignedApproval | null`
- `chainId?: number | null`은 이미 `number | null`이지만 optional이므로 `chainId: number | null` required로 변경

### #20 `ApprovalStore.saveSigner._name?` -- Required+null
- `_name?: string` -> `_name: string | null`
- 호출부에서 `saveSigner(pubKey)` -> `saveSigner(pubKey, null)`

### #21 `ApprovalStore.updateJournalStatus._txHash?` -- DU 미적용
- `_txHash?: string` -> `_txHash: string | null`
- daemon `execution-journal.ts`, `tool-surface.ts` 호출부에서 null 명시 -- Step 04에서 수정

### #22~#23 `GuardedWDKConfig.wallets?/protocols?` -- Default 대신 Optional
- `wallets?: Record<string, WalletEntry>` -> `wallets: Record<string, WalletEntry>`
- `protocols?: Record<string, ProtocolEntry[]>` -> `protocols: Record<string, ProtocolEntry[]>`
- 호출부에서 빈 객체 `{}` 명시

### #24~#25 `GuardedWDKConfig.approvalBroker?/trustedApprovers?` -- DU 미적용
- `approvalBroker?: SignedApprovalBroker` -> `approvalBroker: SignedApprovalBroker | null`
- `trustedApprovers?: string[]` -> `trustedApprovers: string[]`
- `approvalBroker: null`이면 `trustedApprovers`로 broker 생성
- daemon 부팅 시 signer 0명이면 `trustedApprovers: []` 전달 허용

### #26 `GuardedWDKFacade.getAccount.index?` -- Default 대신 Optional
- `getAccount(chain: string, index?: number)` -> `getAccount(chain: string, index: number)`
- 호출부에서 `0` 명시

### #27~#28 `CreateRequestOptions.requestId?/walletName?` -- DU 미적용
- `requestId?: string` -> `requestId: string` (호출부에서 randomUUID 생성)
- `walletName?: string` -> `walletName: string | null`
- `createRequest()` 내부의 `requestId || randomUUID()` -> `requestId` 직접 사용

### #29 `SignedApprovalBroker.constructor.emitter?` -- Optional Deps
- `emitter?: EventEmitter` -> `emitter: EventEmitter` (required)
- 이벤트가 불필요하면 호출부에서 빈 EventEmitter 전달

## 2. 완료 조건
- [ ] `approval-verifier.ts`에서 `VerificationContext` 내 `?:` 0건
- [ ] `approval-store.ts`에서 위반 대상 심볼(`PendingApprovalRequest`, `HistoryEntry`, `saveSigner`, `updateJournalStatus`) 내 `?:` 0건 (정당한 QueryOpts optional 제외)
- [ ] `guarded-wdk-factory.ts`에서 `GuardedWDKConfig` 내 `?:` 0건
- [ ] `signed-approval-broker.ts`에서 `CreateRequestOptions` 내 `?:` 0건, constructor optional param 0건
- [ ] guarded-wdk 패키지 `tsc --noEmit` 통과
- [ ] guarded-wdk 테스트 전체 통과 (approval-broker, factory, sqlite/json-approval-store, integration)
- [ ] factory 테스트에 빈 배열 `trustedApprovers: []` 케이스 fixture 추가 (E3 회귀 보강)
- [ ] `verifyApproval()` 호출부에서 null 명시 확인
- [ ] `createRequest()` 내부에서 `requestId || randomUUID()` 분기 제거 확인

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/
├── src/
│   ├── approval-verifier.ts          # #14~#15: VerificationContext required+null
│   ├── approval-store.ts             # #16~#21: PendingApprovalRequest, HistoryEntry, saveSigner, updateJournalStatus
│   ├── guarded-wdk-factory.ts        # #22~#26: GuardedWDKConfig required, getAccount index required
│   ├── signed-approval-broker.ts     # #27~#29: CreateRequestOptions required, emitter required
│   ├── sqlite-approval-store.ts      # saveSigner, updateJournalStatus 구현체 시그니처 동기화
│   └── json-approval-store.ts        # saveSigner, updateJournalStatus 구현체 시그니처 동기화
└── tests/
    ├── approval-broker.test.ts       # CreateRequestOptions, emitter fixture 수정
    ├── factory.test.ts               # GuardedWDKConfig fixture 수정 + 빈 배열 케이스 추가 (E3)
    ├── sqlite-approval-store.test.ts # saveSigner, updateJournalStatus 호출 수정
    └── json-approval-store.test.ts   # saveSigner, updateJournalStatus 호출 수정
```

### 의존성 분석

**upstream** (Step 01에서 확정):
- `ControlResult` DU -- `signed-approval-broker.ts`에서 직접 참조하지 않음 (protocol 의존은 daemon 경유)

**downstream** (후속 Step에서 수정):
- `VerificationContext` 변경 -> daemon `control-handler.ts` 호출부 (Step 04)
- `saveSigner`, `updateJournalStatus` 시그니처 변경 -> daemon `execution-journal.ts`, `tool-surface.ts` (Step 04)
- `GuardedWDKConfig` 변경 -> daemon `wdk-host.ts` (Step 04)
- `CreateRequestOptions` 변경 -> daemon `ports.ts` (Step 04)
- `getAccount(index)` 변경 -> daemon `tool-surface.ts` (Step 04)

### Side Effect 위험
- `ApprovalStore`는 abstract class이므로, 시그니처 변경 시 `SqliteApprovalStore`, `JsonApprovalStore` 두 구현체를 동시에 수정해야 함
- `GuardedWDKConfig` 변경은 daemon의 `wdk-host.ts`에서 `createGuardedWDK()` 호출 시 모든 필드 명시 필요 (Step 04)
- `emitter` required 변경 시 테스트에서 emitter 없이 broker를 생성하는 코드가 있을 수 있음 -- fixture 수정

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 다음: [Step 03: manifest ValidationResult DU](step-03-manifest.md)
