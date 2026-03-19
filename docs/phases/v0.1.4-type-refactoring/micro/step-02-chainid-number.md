# Step 02: chainId: number 통일 (Change 5)

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- `@wdk-app/canonical`에 `CHAIN_IDS` 상수 + `ChainId` 타입 추가
- `intentHash({ chain })` → `intentHash({ chainId })` 변경
- 전 패키지 `chain: string` → `chainId: number` 변경:
  - guarded-wdk: SignedApproval, ApprovalRequest, ChainPolicies, MiddlewareConfig, PendingRequest, StoredPolicy, HistoryEntry, CronInput, JournalEntry
  - daemon: tool-surface (CHAIN_IDS 변환 + unknown chain 에러), chat-handler, cron-scheduler, control-handler, execution-journal, wdk-host
  - manifest: Manifest.chains, ChainConfig.chainId, manifestToPolicy()
  - app: approval types, SignedApprovalBuilder, usePolicyStore, DashboardScreen, AppProviders, useActivityStore
- SQLite 스키마: `chain TEXT` → `chain_id INTEGER` (모든 테이블)
- JSON Store 키: `${seedId}:ethereum` → `${seedId}:1`

## 2. 완료 조건
- [ ] `grep -rEn '\bchain\??: string' packages/guarded-wdk/src/ packages/daemon/src/ packages/canonical/src/ packages/manifest/src/ packages/app/src/` 결과 0건
- [ ] `CHAIN_IDS` 상수가 canonical/src/index.ts에 존재
- [ ] daemon tool-surface에서 unknown chain → 에러 반환 테스트 통과
- [ ] `npm test` 전체 통과
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` 통과

## 3. 롤백 방법
- git revert (cross-cutting이지만 단일 커밋)
- 영향: 전 패키지

---

## Scope

### 수정 대상 파일
```
packages/canonical/src/
└── index.ts                    # CHAIN_IDS 추가, intentHash 시그니처 변경

packages/guarded-wdk/src/
├── approval-store.ts           # 모든 chain: string → chainId: number
├── guarded-middleware.ts       # evaluatePolicy, MiddlewareConfig
├── signed-approval-broker.ts   # createRequest, getPending
├── approval-verifier.ts        # SignedApproval.chain → chainId
├── json-approval-store.ts      # 키 포맷, 저장/로드
├── sqlite-approval-store.ts    # SQL 스키마, 쿼리
└── guarded-wdk-factory.ts      # policy 로딩

packages/manifest/src/
├── types.ts                    # Manifest.chains, ChainConfig
└── manifest-to-policy.ts       # chainId 파라미터

packages/daemon/src/
├── tool-surface.ts             # CHAIN_IDS 변환 + unknown chain 에러
├── tool-call-loop.ts           # chain 참조
├── chat-handler.ts             # chain 참조
├── cron-scheduler.ts           # CronEntry.chain
├── control-handler.ts          # payload.chain
├── execution-journal.ts        # chain 필드
├── wdk-host.ts                 # chain 파라미터
└── config.ts                   # chain 설정

packages/app/src/
├── core/approval/types.ts      # chain → chainId
├── core/approval/SignedApprovalBuilder.ts  # chain → chainId
├── stores/usePolicyStore.ts    # chain → chainId
├── stores/useActivityStore.ts  # chain → chainId
├── app/providers/AppProviders.tsx  # chain → chainId
└── domains/dashboard/screens/DashboardScreen.tsx  # chain → chainId

모든 테스트 파일 (chain 관련 fixture 전부 수정)
```

### Side Effect 위험
- intentHash 출력 변경 (chain→chainId 키) → 기존 저장 해시와 비호환 (reset 허용)

## FP/FN 검증

### 검증 통과: ✅
- relay는 payload를 투명 전달하므로 수정 불필요 (OK)

---

> 다음: [Step 03: camelCase 통일](step-03-camelcase.md)
