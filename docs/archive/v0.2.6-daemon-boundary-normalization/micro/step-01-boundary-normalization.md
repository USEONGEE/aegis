# Step 01: Daemon 타입 경계 정합성 복원 (전체)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: v0.2.5 guarded-wdk 변경 완료 (이미 반영됨)

---

## 1. 구현 내용 (단일 원자적 커밋)

### Phase A: wdk-host.ts — boundary type 정의
- `WDKInstance` interface 제거
- `type GuardedWDK = Awaited<ReturnType<typeof import('@wdk-app/guarded-wdk').createGuardedWDK>>` derived type 정의
- daemon이 실제 사용하는 메서드만 `Pick<>` 또는 equivalent 로 좁히기
- `createMockWDK` 반환 타입을 boundary type에 정렬
- `handleControlMessage`에서 `wdk` 파라미터 제거에 맞춰 호출부 업데이트

### Phase B: control-handler.ts — broker/store shadow 제거
- `ApprovalStoreWriter` shadow interface 제거
- broker shadow (`submitApproval: Record<string, unknown>`) 제거 → `Pick<SignedApprovalBroker, ...>` 사용
- `_trustedApprovers` 접근 제거 → `store.listSigners()` + `setTrustedApprovers()` 패턴
- `wdk` 파라미터 제거
- `toSignedApproval()` 매핑 함수 추가 (wire payload `signature`/`approverPubKey` → `SignedApproval` `sig`/`approver`)

### Phase C: tool-surface.ts + execution-journal.ts + admin-server.ts — any 제거
- `broker: any`, `store: any` → shared type 또는 Pick<>
- `JournalEntry`/`JournalListOptions` shadow 제거 → guarded-wdk export 사용
- `admin-server.ts` 연동

### Phase D: index.ts — relay event 정합 + cleanup
- `ApprovalGranted` 제거
- `TransactionSigned`, `WalletCreated`, `WalletDeleted` 추가
- `tx_approval` 잔재 제거
- `handleControlMessage` 호출에서 `wdk` 인자 제거

### Phase E: 테스트 정렬
- control-handler.test.ts: `tx_approval` 테스트 제거, mock 정렬
- tool-surface.test.ts: any → 타입 정렬

## 2. 완료 조건
- [ ] F1: `grep -c "interface WDKInstance" packages/daemon/src/wdk-host.ts` → 0
- [ ] F3: `grep -c 'submitApproval.*Record' packages/daemon/src/control-handler.ts` → 0
- [ ] F4: `grep -c "_trustedApprovers" packages/daemon/src/control-handler.ts` → 0
- [ ] F5: `grep -c 'broker: any\|store: any' packages/daemon/src/tool-surface.ts` → 0
- [ ] F6: `grep -c "ApprovalStoreWriter" packages/daemon/src/control-handler.ts` → 0
- [ ] F7: `grep -c 'interface JournalEntry\|interface JournalListOptions' packages/daemon/src/execution-journal.ts` → 0
- [ ] F9: `grep -c "ApprovalGranted" packages/daemon/src/index.ts` → 0
- [ ] F10: `grep -c 'TransactionSigned\|WalletCreated\|WalletDeleted' packages/daemon/src/index.ts` → 3
- [ ] F11: `grep -c 'wdk?:' packages/daemon/src/control-handler.ts` → 0
- [ ] F12: `grep "toSignedApproval" packages/daemon/src/control-handler.ts` → 1건 이상
- [ ] F13: `grep -c "guarded-wdk/src/" packages/daemon/src/*.ts` → 0
- [ ] N1: boundary 파일 tsc 에러 0건
- [ ] N2: daemon 테스트 통과
- [ ] N3: `grep -c "tx_approval" packages/daemon/tests/control-handler.test.ts` → 0

## 3. 롤백 방법
- `git revert` — 단일 커밋 원자적 롤백

---

## Scope

### 수정 대상 파일 (8개)
```
packages/daemon/
├── src/
│   ├── wdk-host.ts              # WDKInstance → derived type
│   ├── control-handler.ts       # broker/store shadow 제거 + toSignedApproval
│   ├── tool-surface.ts          # any 제거
│   ├── execution-journal.ts     # JournalEntry shadow 제거
│   ├── admin-server.ts          # JournalListOptions 연동
│   └── index.ts                 # relay event + handleControlMessage 호출
└── tests/
    ├── control-handler.test.ts  # tx_approval 제거, mock 정렬
    └── tool-surface.test.ts     # any 정렬
```

### Scope 제외 파일 (영향 없음)
- `cron-scheduler.ts`: `WDKContext` import하지만 broker/store를 직접 사용하지 않음. WDKContext 타입 변경에 자동 추론
- `chat-handler.ts`: WDKContext의 메서드를 직접 호출하지 않음
- `tool-call-loop.ts`: WDKContext를 pass-through만 함
- `openclaw-client.ts`: guarded-wdk와 무관 (OpenAI SDK)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| wdk-host.ts | WDKInstance 교체 + mock 정렬 | ✅ OK |
| control-handler.ts | broker/store shadow + toSignedApproval + wdk 제거 | ✅ OK |
| tool-surface.ts | any 제거 | ✅ OK |
| execution-journal.ts | JournalEntry shadow 제거 | ✅ OK |
| admin-server.ts | JournalListOptions 연동 | ✅ OK |
| index.ts | relay event + handleControlMessage 호출 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| cron-scheduler.ts | ❌ 제외 | OK — 자동 추론 |
| chat-handler.ts | ❌ 제외 | OK — pass-through |
| tool-call-loop.ts | ❌ 제외 | OK — pass-through |

### 검증 통과: ✅
