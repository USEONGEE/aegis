# Step 05: PendingRequest 이름 분리 (Change 3)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 04

---

## 1. 구현 내용 (design.md 기반)
- `PendingRequest` → `PendingApprovalRequest` 이름 변경, camelCase 필드
- ApprovalStore 메서드 이름 변경: loadPending→loadPendingApprovals, savePending→savePendingApproval, removePending→removePendingApproval
- `PendingMessageRequest` 인터페이스 정의 (daemon에서 사용, Step 06 준비)
- SignedApprovalBroker: getPending→getPendingApprovals, 반환 타입 변경
- SQLite pending_requests 테이블 → pending_approvals 이름 변경

## 2. 완료 조건
- [ ] `grep -rn 'interface PendingRequest ' packages/guarded-wdk/src/` 결과 0건
- [ ] `grep -n 'loadPending(' packages/guarded-wdk/src/approval-store.ts` 결과 0건
- [ ] PendingApprovalRequest에 camelCase 필드 (requestId, seedId, chainId, targetHash, createdAt)
- [ ] approval-broker.test.ts 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk + daemon (broker 사용부)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts            # PendingApprovalRequest 정의, 메서드 이름 변경
├── signed-approval-broker.ts    # getPendingApprovals, 타입 변경
├── json-approval-store.ts       # 메서드 이름 변경, 내부 변환
└── sqlite-approval-store.ts     # 메서드 이름 변경, 테이블 이름 변경

packages/daemon/src/
├── tool-surface.ts              # broker.getPending → getPendingApprovals
└── control-handler.ts           # broker 메서드 호출 변경

packages/guarded-wdk/tests/
├── approval-broker.test.ts      # 타입/메서드 이름 변경
├── json-approval-store.test.ts  # 메서드 이름 변경
└── sqlite-approval-store.test.ts # 메서드 이름 변경

packages/daemon/tests/
├── tool-surface.test.ts         # mock 변경
└── control-handler.test.ts      # mock 변경
```

## FP/FN 검증

### 검증 통과: ✅

---

> 다음: [Step 06: FIFO queue](step-06-fifo-queue.md)
