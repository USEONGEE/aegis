# Step 05: Cron ChainScope DU

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `ChainScope` DU 도입: `{ kind: 'specific'; chainId: number } | { kind: 'all' }`
- `CronInput.chainId`, `StoredCron.chainId` → `ChainScope`
- `QueuedMessage.chainId` → `ChainScope`
- `CronBase.chainId`, `CronDispatch.chainId` → `ChainScope`
- Store 구현: DB null → `{ kind: 'all' }` 변환
- cron-scheduler, tool-surface 등 caller 업데이트

## 2. 완료 조건
- [ ] `rg 'ChainScope' packages/ --type ts` — 타입 정의 존재
- [ ] `rg 'chainId.*number.*null' packages/daemon/src/daemon-store.ts packages/daemon/src/message-queue.ts` 결과 0건
- [ ] switch exhaustiveness check (`never` 가드) 존재
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── daemon-store.ts          # CronInput, StoredCron, ChainScope 정의
├── sqlite-daemon-store.ts   # DB row → ChainScope 변환
├── message-queue.ts         # QueuedMessage.chainId → ChainScope
├── cron-scheduler.ts        # CronBase, CronDispatch, tick 로직
├── chat-handler.ts          # QueuedMessage 생성 시 ChainScope
├── tool-surface.ts          # registerCron에서 ChainScope 구성
└── admin-server.ts          # cron list 표시

packages/daemon/tests/
└── message-queue.test.ts    # QueuedMessage chainId → ChainScope
```

### Side Effect 위험
- Cron 전체 실행 경로 변경 — cron-scheduler 테스트로 검증

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| daemon-store.ts | CronInput, StoredCron, ChainScope 정의 | ✅ OK |
| sqlite-daemon-store.ts | DB row → ChainScope 변환 | ✅ OK |
| message-queue.ts | QueuedMessage.chainId → ChainScope | ✅ OK |
| cron-scheduler.ts | CronBase, CronDispatch, tick 로직 | ✅ OK |
| chat-handler.ts | QueuedMessage 생성 | ✅ OK |
| tool-surface.ts | registerCron ChainScope 구성 | ✅ OK |
| admin-server.ts | cron list 표시 | ✅ OK |
| message-queue.test.ts | QueuedMessage 테스트 | ✅ OK |

### False Negative (누락)
없음 — `rg 'chainId.*null' packages/daemon/src/` 전수 확인 완료

### 검증 통과: ✅

---

→ 다음: [Step 06: EvaluationResult DU](step-06-evaluation-result.md)
