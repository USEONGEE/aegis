# 작업위임서 — ApprovalStore DB 분리 (WDK Store / Daemon Store)

> ApprovalStore를 WDK Store + Daemon Store로 분리하여 단일 책임 원칙 + 물리적 접근 경계 확보

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: `packages/guarded-wdk`, `packages/daemon` 전체

### What (무엇을)

**Phase A: Store 분리**
- [ ] `ApprovalStore` 추상 클래스를 `WdkStore`와 `DaemonStore`로 분리
- [ ] `WdkStore` 테이블: master_seed, wallets, policies, pending_approvals, approval_history, signers, nonces, policy_versions
- [ ] `DaemonStore` 테이블: crons, execution_journal, rejection_history
- [ ] `SqliteApprovalStore` → `SqliteWdkStore` + `SqliteDaemonStore`로 분리
- [ ] `JsonApprovalStore` → `JsonWdkStore` + `JsonDaemonStore`로 분리
- [ ] **WDK에서 cron 흔적 철저 제거**: `CronInput`, `StoredCron`, `CronRow`, `saveCron()`, `listCrons()`, `removeCron()`, `updateCronLastRun()` 전부 WdkStore/guarded-wdk에서 삭제. cron 타입과 인터페이스는 `packages/daemon/src/store/`에 새로 정의

**Phase B: Facade 확장**
- [ ] `GuardedWDKFacade`에 daemon이 필요한 WDK 데이터 조회 메서드 추가:
  - `loadPolicy(accountIndex, chainId)` → `StoredPolicy | null`
  - `getPolicyVersion(accountIndex, chainId)` → `number`
  - `listPolicyVersions(accountIndex, chainId)` → `PolicyVersionEntry[]`
  - `listSigners()` → `StoredSigner[]`
  - `listWallets()` → `StoredWallet[]`
  - `loadPendingApprovals(...)` → 이미 `broker.getPendingApprovals()` 존재, 이것으로 통일

**Phase C: Daemon 직접 접근 제거 + 파일 분리**
- [ ] `getApprovalStore()`를 facade에서 제거 (daemon이 store 참조를 얻는 경로 차단)
- [ ] `tool-surface.ts`의 store 직접 호출 → facade 메서드로 교체
- [ ] `admin-server.ts`의 `listSigners()`, `listWallets()` → facade 경유
- [ ] `wdk-host.ts`의 `getMasterSeed()`, `listSigners()` → factory 초기화 내부로 이동
- [ ] **daemon 코드에서 WDK facade 호출과 DaemonStore 직접 호출을 파일 단위로 분리**. 현재 `tool-surface.ts`에 정책 조회(WDK)와 cron CRUD(daemon 자체)가 섞여 있음. 예시 분리안:
  - `tool-surface-wdk.ts` — WDK facade 경유 도구 (sendTransaction, transfer, policyList, listSigners 등)
  - `tool-surface-daemon.ts` — DaemonStore 직접 접근 도구 (registerCron, listCrons, removeCron, listRejections 등)
  - 또는 도메인별 분리 (`tools/tx.ts`, `tools/policy.ts`, `tools/cron.ts` 등) — PRD에서 결정

**Phase D: Rejection 내부화 검토**
- [ ] `saveRejection()`을 WDK 내부로 이동할지 결정 (미결정 — 아래 참조)

### When (언제)
- 선행 조건: v0.4.4 완료 후 (app 이벤트 마이그레이션 먼저)
- 기한 없음

### Where (어디서)

| 파일 | 변경 내용 |
|------|----------|
| `packages/guarded-wdk/src/approval-store.ts` | 추상 클래스 분리 → WdkStore |
| `packages/guarded-wdk/src/sqlite-approval-store.ts` | SqliteWdkStore로 축소 |
| `packages/guarded-wdk/src/json-approval-store.ts` | JsonWdkStore로 축소 |
| `packages/guarded-wdk/src/guarded-wdk-factory.ts` | facade 메서드 추가, `getApprovalStore()` 제거 |
| `packages/guarded-wdk/src/index.ts` | export 정리 |
| `packages/daemon/src/tool-surface.ts` | store 직접 호출 → facade 경유 |
| `packages/daemon/src/execution-journal.ts` | DaemonStore 사용 |
| `packages/daemon/src/cron-scheduler.ts` | DaemonStore 사용 |
| `packages/daemon/src/admin-server.ts` | store 직접 호출 → facade 경유 |
| `packages/daemon/src/wdk-host.ts` | store 노출 제거 |
| `packages/daemon/src/store/` (신규) | DaemonStore 추상 클래스 + Sqlite/Json 구현체 |

### Why (왜)

현재 `ApprovalStore`가 WDK + daemon 관심사를 모두 담고 있어서:

1. **경계 위반**: daemon이 `getApprovalStore()`로 store 참조를 얻어 WDK 도메인 데이터를 직접 CRUD. No Two-Way Implements 원칙의 정신에 어긋남
2. **단일 책임 위반**: cron(daemon 스케줄링)과 master_seed(WDK 보안)가 같은 추상 클래스에 공존
3. **우회 가능**: 물리적으로 같은 DB이므로 facade를 무시하고 store를 직접 호출하는 코드가 계속 생길 수 있음
4. **테스트 복잡도**: daemon 테스트에서 WDK 테이블까지 초기화해야 함

DB를 분리하면 **컴파일 타임에 경계 위반이 불가능**해짐.

### How (어떻게)

**DB 분리 구조:**
```
┌─────────────────────┐     ┌─────────────────────┐
│     WdkStore         │     │    DaemonStore        │
│  (wdk만 접근 가능)    │     │  (daemon만 접근 가능)  │
├─────────────────────┤     ├──────────────────────┤
│ master_seed          │     │ crons                 │
│ wallets              │     │ execution_journal     │
│ policies             │     │ rejection_history     │
│ pending_approvals    │     │                       │
│ approval_history     │     │                       │
│ signers              │     │                       │
│ nonces               │     │                       │
│ policy_versions      │     │                       │
└─────────────────────┘     └──────────────────────┘
         ▲                            ▲
         │                            │
    guarded-wdk                    daemon
    (직접 접근)                   (직접 접근)
         ▲
         │
      daemon
   (facade 경유만 가능)
```

**daemon → WDK 데이터 접근 패턴:**
```ts
// Before: store 직접 접근
const store = wdk.getApprovalStore()
const policy = await store.loadPolicy(accountIndex, chainId)
const signers = await store.listSigners()

// After: facade 경유
const policy = await wdk.loadPolicy(accountIndex, chainId)
const signers = await wdk.listSigners()
```

**DaemonStore 위치:**
```
packages/daemon/src/store/
  daemon-store.ts          -- 추상 클래스 (cron, journal, rejection)
  sqlite-daemon-store.ts   -- SQLite 구현
  json-daemon-store.ts     -- JSON 파일 구현 (테스트용)
```

워크플로우: `/codex-phase-workflow` 또는 `/phase-workflow`

---

## 맥락

### 현재 상태
- CI: 18 checks, 16 PASS / 2 FAIL (dead-exports 126건, no-public-verifier-export 1건)
- ApprovalStore: 1개 추상 클래스, 11개 카테고리 (seed, wallet, policy, pending, history, signer, nonce, cron, journal, rejection, policyVersion)
- daemon의 store 직접 호출: tool-surface.ts 12건, execution-journal.ts 4건, cron-scheduler.ts 3건, admin-server.ts 2건, wdk-host.ts 2건

### 사용자 확정 결정사항
- **cron은 WDK의 관심사가 아니다** → WDK에서 cron 관련 코드를 철저하게 제거. CronInput, StoredCron, saveCron, listCrons, removeCron, updateCronLastRun 전부 WdkStore에서 삭제. cron은 daemon의 스케줄링 도메인이므로 DaemonStore에만 존재해야 한다
- daemon은 WDK store에 직접 접근 불가 → facade 경유만 허용
- 물리적 DB 분리로 우회 불가능하게 강제
- **daemon 코드에서 "WDK 경유"와 "자체 store 직접 접근"을 명확히 구분하라** → 파일 수준에서 분리. WDK facade를 호출하는 코드와 DaemonStore를 직접 호출하는 코드가 같은 파일에 섞이지 않도록 한다. 예를 들어 tool-surface.ts에서 정책 조회(WDK facade)와 cron CRUD(DaemonStore)가 섞여 있으면, 각각 별도 모듈로 분리하여 의존 방향을 파일 단위로 명확하게 만든다

### 미결정 사항
- **rejection_history 소속**: daemon이 `PolicyRejectionError`를 catch해서 기록하므로 DaemonStore가 자연스러움. 단, WDK 내부에서 reject 시 자동 기록하는 방향도 가능 (v0.4.2의 savePolicy 내부화와 같은 패턴). → Phase PRD에서 결정
- **policy_versions 소속**: 현재 `savePolicy()` 내부에서 버전 관리. WdkStore에 남기는 게 맞을 수 있음. → Phase PRD에서 결정
- **execution_journal 소속**: middleware가 tx를 실행하니 WDK가 기록하는 게 맞을 수 있음. 현재는 daemon의 execution-journal.ts가 담당. → Phase PRD에서 결정

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| guarded-wdk 아키텍처 | `docs/report/guarded-wdk-architecture-one-pager.md` | Store(Ledger) 도메인 구조 |
| dead-exports 분류 위임서 | `docs/handover/dead-exports-triage.md` | 관련 타입 정리 작업 |
| v0.4.2 Phase | `docs/archive/v0.4.2-wdk-event-unification/` | savePolicy 내부화 선례 |

---

## 주의사항
- store 분리 시 기존 SQLite DB 마이그레이션 필요 (테이블 이동 또는 별도 DB 파일 생성)
- `JsonApprovalStore`는 테스트에서 많이 사용 — 테스트 깨짐 범위가 클 수 있음
- dead-exports 정리와 동시 진행하면 충돌 가능 — 순서 조율 필요

## 시작 방법
```
/phase-workflow 또는 /codex-phase-workflow

Phase 이름: Store 경계 분리 (WdkStore / DaemonStore)
Step 1(PRD)에서 미결정 사항 3건 먼저 확정
```
