# 작업 티켓 - v0.2.10

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | ports.ts 생성 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | tool-surface.ts 변경 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | tool-call-loop.ts 변경 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | chat-handler.ts 변경 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | cron-scheduler.ts 변경 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | admin-server.ts 변경 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 07 | index.ts 변경 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 08 | 최종 검증 | 🟢 | N/A | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 ─┬─→ 02 ─┬─→ 03 ─┐
    │        ├─→ 04 ─┤
    │        ├─→ 05 ─┤   (03~06 병렬 가능)
    └─→ 06 ─┘        ├─→ 07 ─→ 08
```

상세:
- Step 01: 선행 없음 (신규 파일)
- Step 02: Step 01 필요 (ports.ts import)
- Step 03: Step 02 필요 (ToolExecutionContext export)
- Step 04: Step 02 필요 (ToolExecutionContext export)
- Step 05: Step 02 필요 (ToolExecutionContext export)
- Step 06: Step 01 필요 (AdminStorePort import). Step 02와 독립 가능하나, WDKContext import 제거를 위해 Step 02 이후가 안전.
- Step 07: Step 02-06 모두 필요 (모든 소비자 시그니처가 확정되어야 조립 코드 변경 가능)
- Step 08: Step 01-07 모두 필요 (전체 검증)

## 변경 파일 요약

| 파일 | 변경 유형 | 관련 Step |
|------|-----------|----------|
| `packages/daemon/src/ports.ts` | **신규** | 01 |
| `packages/daemon/src/tool-surface.ts` | 수정 | 02 |
| `packages/daemon/src/tool-call-loop.ts` | 수정 | 03 |
| `packages/daemon/src/chat-handler.ts` | 수정 | 04 |
| `packages/daemon/src/cron-scheduler.ts` | 수정 | 05 |
| `packages/daemon/src/admin-server.ts` | 수정 | 06 |
| `packages/daemon/src/index.ts` | 수정 | 07 |

총 **7개 파일** (신규 1, 수정 6).

## 커버리지 매트릭스

### PRD 목표 -> 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| broker:any -> ApprovalBrokerPort interface | Step 01, 02 | ✅ |
| store:any -> ToolStorePort interface | Step 01, 02 | ✅ |
| WDKContext -> ToolExecutionContext 이름 변경 | Step 02, 03, 04, 05, 07 | ✅ |
| dead field 제거 (admin-server wdkContext) | Step 06, 07 | ✅ |
| relayClient optional 필드 제거 | Step 02, 07 | ✅ |
| pass-through 경로 유지 (이름만 변경) | Step 03, 04, 05, 07 | ✅ |

### DoD -> 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: WDKContext 이름 코드베이스에 없음 | Step 02, 03, 04, 05, 06, 07, 08 | ✅ |
| F2: broker 타입이 ApprovalBrokerPort | Step 02, 08 | ✅ |
| F3: store 타입이 ToolStorePort | Step 02, 08 | ✅ |
| F4: ToolStorePort 9개 메서드 | Step 01, 08 | ✅ |
| F5: ApprovalBrokerPort createRequest 1개 | Step 01, 08 | ✅ |
| F6: admin-server에서 wdkContext 제거 | Step 06, 08 | ✅ |
| F7: admin-server의 store가 AdminStorePort | Step 06, 08 | ✅ |
| F8: ToolExecutionContext에 relayClient 없음 | Step 02, 08 | ✅ |
| F9: processChat이 ToolExecutionContext 사용 | Step 03, 08 | ✅ |
| F10: handleChatMessage가 ToolExecutionContext 사용 | Step 04, 08 | ✅ |
| F11: CronScheduler가 ToolExecutionContext 보관 | Step 05, 08 | ✅ |
| N1: 타입 에러 미발생 (baseline 이하) | Step 08 | ✅ |
| N2: broker/store 위치에 any 없음 | Step 02, 06, 08 | ✅ |
| N3: 타입 그래프에 Port 노드 존재 | Step 08 | ✅ |
| E1: SqliteApprovalStore -> ToolStorePort 호환 | Step 08 | ✅ |
| E2: SqliteApprovalStore -> AdminStorePort 호환 | Step 08 | ✅ |
| E3: CronStore/ToolStorePort 중복 충돌 없음 | Step 08 | ✅ |
| E4: control-handler에 Port import 없음 | Step 08 | ✅ |

### 설계 결정 -> 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| 대안 B 채택 (Port + 이름 변경) | Step 01-07 | ✅ |
| ToolStorePort 9개 메서드 정의 | Step 01 | ✅ |
| ApprovalBrokerPort createRequest 1개 | Step 01 | ✅ |
| AdminStorePort (admin-server 전용) | Step 01, 06 | ✅ |
| Port interface를 daemon 내부에 정의 (ports.ts) | Step 01 | ✅ |
| WDKContext -> ToolExecutionContext 이름 변경 | Step 02 | ✅ |
| relayClient optional 필드 제거 | Step 02 | ✅ |
| AdminServer dead field (wdkContext) 제거 | Step 06 | ✅ |
| AdminServer store: any -> AdminStorePort | Step 06 | ✅ |
| pass-through 구조 의도적 유지 | Step 03, 04, 05, 07 | ✅ |
| CronStore interface 유지 (ToolStorePort와 별도) | Step 05 | ✅ |
| control-handler는 변경 대상 아님 (out of scope) | Step 08 (E4) | ✅ |

## Step 상세
- [Step 01: ports.ts 생성](step-01-ports-file.md)
- [Step 02: tool-surface.ts 변경](step-02-tool-surface.md)
- [Step 03: tool-call-loop.ts 변경](step-03-tool-call-loop.md)
- [Step 04: chat-handler.ts 변경](step-04-chat-handler.md)
- [Step 05: cron-scheduler.ts 변경](step-05-cron-scheduler.md)
- [Step 06: admin-server.ts 변경](step-06-admin-server.md)
- [Step 07: index.ts 변경](step-07-index.md)
- [Step 08: 최종 검증](step-08-verify.md)
