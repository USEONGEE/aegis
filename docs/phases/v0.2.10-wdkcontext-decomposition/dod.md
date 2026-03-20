# DoD (Definition of Done) - v0.2.10

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `WDKContext` 이름이 코드베이스에 없음 | `rg 'WDKContext' packages/daemon/src/ --type ts` 결과 0건 |
| F2 | `ToolExecutionContext.broker` 타입이 `ApprovalBrokerPort` | `rg 'broker: ApprovalBrokerPort' packages/daemon/src/tool-surface.ts` 1건 |
| F3 | `ToolExecutionContext.store` 타입이 `ToolStorePort` | `rg 'store: ToolStorePort' packages/daemon/src/tool-surface.ts` 1건 |
| F4 | `ToolStorePort`에 9개 메서드 정의 | `sed -n '/interface ToolStorePort/,/^}/p' packages/daemon/src/ports.ts \| rg 'Promise<' \| wc -l` 결과 9 |
| F5 | `ApprovalBrokerPort`에 `createRequest` 1개만 정의 | `rg -A3 'interface ApprovalBrokerPort' packages/daemon/src/ports.ts` 후 멤버 1개 확인 |
| F6 | `admin-server.ts`에서 `wdkContext` 필드 제거 | `rg 'wdkContext' packages/daemon/src/admin-server.ts` 결과 0건 |
| F7 | `admin-server.ts`의 store가 `AdminStorePort` 타입 | `rg 'AdminStorePort' packages/daemon/src/admin-server.ts` 1건 이상 |
| F8 | `ToolExecutionContext`에 `relayClient` 필드 없음 | `rg 'relayClient' packages/daemon/src/tool-surface.ts` 결과 0건 |
| F9 | processChat이 ToolExecutionContext를 받음 | `rg 'ToolExecutionContext' packages/daemon/src/tool-call-loop.ts` 1건 이상 |
| F10 | handleChatMessage가 ToolExecutionContext를 받음 | `rg 'ToolExecutionContext' packages/daemon/src/chat-handler.ts` 1건 이상 |
| F11 | CronScheduler가 ToolExecutionContext를 보관 | `rg 'ToolExecutionContext' packages/daemon/src/cron-scheduler.ts` 1건 이상 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 이번 Phase 변경으로 새 타입 에러 미발생 | `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 \| grep 'error TS' \| wc -l` 결과 ≤ 4 (현재 baseline: index.ts TS2349/TS2345, openclaw-client.ts TS2769 x2) |
| N2 | daemon/src 내 broker/store 위치에 `any` 타입 없음 | `rg 'broker: any\|store: any' packages/daemon/src/ --type ts` 결과 0건 |
| N3 | 타입 그래프에 Port 노드 존재 | `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json && rg 'ToolStorePort\|ApprovalBrokerPort' docs/type-dep-graph/type-dep-graph.json` 2건 이상 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | SqliteApprovalStore → ToolStorePort 구조적 타이핑 호환 | wdk-host.ts/index.ts에서 store를 ToolStorePort 위치에 넘기는 코드에서 새 에러 없음 | N1 검증 (에러 수 비증가) |
| E2 | SqliteApprovalStore → AdminStorePort 구조적 타이핑 호환 | index.ts에서 store를 AdminStorePort 위치에 넘기는 코드에서 새 에러 없음 | N1 검증 |
| E3 | CronStore와 ToolStorePort 중복 메서드 (saveCron, listCrons, removeCron) | 양쪽 모두 SqliteApprovalStore를 만족, 충돌 없음 | N1 검증 |
| E4 | control-handler.ts는 Port interface 미사용 (concrete 직접 사용) | control-handler.ts에 Port import 없음 | `rg 'Port' packages/daemon/src/control-handler.ts` 결과 0건 |

## 커버리지 매핑

### PRD 목표 → DoD

| PRD 목표 | DoD 항목 |
|----------|---------|
| broker:any → ApprovalBrokerPort | F2, F5 |
| store:any → ToolStorePort | F3, F4 |
| WDKContext → ToolExecutionContext 이름 변경 | F1 |
| dead field 제거 (admin-server wdkContext) | F6 |
| admin-server store:any → AdminStorePort | F7 |
| relayClient optional 제거 | F8 |
| pass-through 유지 (chat-handler) | F10 |
| pass-through 유지 (tool-call-loop) | F9 |
| pass-through 유지 (cron-scheduler) | F11 |

### 설계 결정 → DoD

| 설계 결정 | DoD 항목 |
|----------|---------|
| ToolStorePort 9개 메서드 | F4 |
| ApprovalBrokerPort createRequest 1개 | F5 |
| AdminStorePort (admin-server 전용) | F7 |
| AdminServer dead field 제거 | F6 |
| relayClient 제거 | F8 |
| Port 구조적 타이핑 호환 | E1, E2, E3 |
| handleChatMessage 시그니처 변경 | F10 |
