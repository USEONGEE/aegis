# 작업위임서 — v0.1.6 PendingRequest 이름 정리

> 다음 세션/에이전트가 바로 시작할 수 있도록 맥락 + 결정사항 + 구현 방향을 정리.

---

## 배경

v0.1.4에서 `PendingRequest`를 `PendingApprovalRequest` + `PendingRequest`로 분리했지만, `PendingRequest`라는 이름이 모호함. 승인 대기인지 메시지 대기인지 구분 안 됨.

## 확정 결정사항 (사용자 합의)

### 1. 이름 변경
```
PendingRequest → PendingMessageRequest
```

### 2. 공통 추상화 도입
```typescript
interface PendingBase {
  requestId: string
  seedId: string
  chainId: number
  createdAt: number
}

interface PendingApprovalRequest extends PendingBase {
  type: ApprovalType
  targetHash: string
  metadata?: Record<string, unknown>
}

interface PendingMessageRequest extends PendingBase {
  sessionId: string
  prompt: string
  source: 'user' | 'cron'
}
```

### 3. 장점
- store에서 "모든 pending 조회" → `PendingBase[]` 반환
- 취소 API `cancel(requestId)` 하나로 통일 — 타입 무관

## 영향 범위

| 패키지 | 파일 | 변경 |
|--------|------|------|
| guarded-wdk | approval-store.ts, store-types.ts | PendingBase 추가, PendingRequest → PendingMessageRequest |
| guarded-wdk | json-approval-store.ts, sqlite-approval-store.ts | 메서드 시그니처 수정 |
| guarded-wdk | signed-approval-broker.ts | PendingApprovalRequest 그대로 (이미 맞음) |
| daemon | tool-surface.ts, chat-handler.ts, cron-scheduler.ts | PendingMessageRequest 사용 |
| daemon | control-handler.ts | PendingApprovalRequest 그대로 |

## 규모

작은 변경. 이름 변경 + 인터페이스 1개 추가. 동작 변경 없음.

## 시작 방법

```
/codex-phase-workflow v0.1.6
```

Step 1 (PRD) → 이 문서 참조. Step 2~5는 빠르게.

## 참조
- 현재 타입 그래프: `docs/type-dep-graph/type-dep-graph.json` (116 nodes, 171 edges)
- 현재 테스트: 268 passed, 15 suites
- CI: 7/7 PASS
