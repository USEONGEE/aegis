# WDKContext 분해 + Port Interface - v0.2.10

## 문제 정의

### 현상
Daemon 패키지의 `WDKContext` (tool-surface.ts:25)가 `broker: any`, `store: any`를 사용하여 실제 타입 의존성을 숨기고 있으며, god object 성향을 보인다.

```typescript
export interface WDKContext {
  wdk: WDKInstance
  broker: any        // ← 실제: SignedApprovalBroker
  store: any         // ← 실제: SqliteApprovalStore (9개 메서드 사용)
  logger: Logger
  journal: ExecutionJournal | null
  relayClient?: RelayClient
}
```

### 원인
- 초기 구현에서 guarded-wdk 타입을 직접 import하지 않고 `any`로 편의 처리
- WDKContext가 daemon 전체의 의존성 전달 bucket으로 확대
- 소비자별로 실제 필요한 멤버가 다른데, 전체 context를 통째로 전달

### 영향
1. **타입 그래프 착시**: `any`로 인해 store/broker 에지가 숨겨져 그래프가 "깨끗해 보이는 착시" 발생. 실제 결합은 tool-surface.ts 내부에서 강하게 존재.
2. **God object 성향**: wdk, broker, store, logger, journal, relayClient 6개를 한 번에 들고 여러 모듈로 흘림.
   - chat-handler는 `logger`만 직접 사용하고 나머지는 통째로 전달
   - admin-server는 `WDKContext`를 저장만 하고 직접 소비하지 않음
3. **Store 계약 불명확**: `store`에서 실제 호출하는 메서드: `getPolicyVersion`, `saveRejection`, `loadPolicy`, `loadPendingApprovals`, `saveCron`, `listCrons`, `removeCron`, `listRejections`, `listPolicyVersions` — 이 계약이 타입에 없음.
4. **Bucket 전달 확산**: WDKContext를 통째로 넘기는 패턴이 chat-handler → tool-call-loop → tool-surface로 전파. `CronScheduler`도 `WDKContext`를 보관하고 `processChat`에 그대로 넘김 (cron-scheduler.ts:63, :200).

### 목표
- `broker: any`를 `ApprovalBrokerPort` interface로 교체 (현재 사용 메서드: `createRequest` 1개만 정의)
- `store: any`를 `ToolStorePort` interface로 교체 (사용하는 9개 메서드만 정의)
- WDKContext를 `ToolExecutionContext`로 이름 변경하여 역할 명확화 (실제 소비자는 tool-surface.ts뿐)
- dead field 제거: admin-server의 wdkContext 필드 제거, relayClient optional 필드 제거
- pass-through 경로(chat-handler → tool-call-loop → tool-surface)는 유지 — context 전달 패턴 자체는 변경하지 않음 (이름만 바뀜)

### 비목표 (Out of Scope)
- ToolResult/ControlPayload union 분리 (v0.2.9에서 처리)
- TOOL_DEFINITIONS 모듈 분리 (v0.2.11에서 처리)
- Cron/Queue 타입 정리 (v0.2.11에서 처리)
- guarded-wdk 내부 ApprovalStore 인터페이스 변경

## 제약사항
- v0.2.9 완료 후 개발(Step 5) 진행. PRD~Tickets(Step 1~4)는 병렬 작성 가능하나, 실제 코드 변경은 v0.2.9 ToolResult union이 확정된 후 시작.
- Port interface는 daemon 패키지 내부에 정의 (guarded-wdk에 역방향 의존 금지)
- Breaking change 허용
