# Step 03: Filter Param Consolidation

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `PendingApprovalFilter` 인터페이스 도입
- `WdkStore.loadPendingApprovals(filter: PendingApprovalFilter)` 시그니처 변경
- `CronFilter` 인터페이스 도입
- `DaemonStore.listCrons(filter: CronFilter)` 시그니처 변경
- 모든 caller 업데이트
- Ports 인터페이스 업데이트 (ToolFacadePort, QueryFacadePort)

## 2. 완료 조건
- [ ] `rg 'loadPendingApprovals\(' packages/ --type ts` — `(null` 패턴 0건
- [ ] `rg 'listCrons\(' packages/daemon/ --type ts` — `(null` 패턴 0건
- [ ] `PendingApprovalFilter` 타입 존재
- [ ] `CronFilter` 타입 존재
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts               # loadPendingApprovals 시그니처, PendingApprovalFilter 정의
├── guarded-wdk-factory.ts     # getPendingApprovals caller
├── signed-approval-broker.ts  # loadPendingApprovals caller
├── sqlite-wdk-store.ts        # override 시그니처
└── json-wdk-store.ts          # override 시그니처

packages/daemon/src/
├── daemon-store.ts            # listCrons 시그니처, CronFilter 정의
├── sqlite-daemon-store.ts     # override 시그니처
├── cron-scheduler.ts          # listCrons caller
├── tool-surface.ts            # getPendingApprovals caller
├── ports.ts                   # ToolFacadePort, QueryFacadePort
└── query-handler.ts           # getPendingApprovals caller
```

### Side Effect 위험
- 시그니처 변경이므로 모든 caller 누락 시 컴파일 에러로 즉시 감지

## FP/FN 검증

### 검증 통과: ✅

---

→ 다음: [Step 04: History Null Removal](step-04-history-null.md)
