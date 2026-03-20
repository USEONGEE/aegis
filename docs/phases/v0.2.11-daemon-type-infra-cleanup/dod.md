# DoD (Definition of Done) - v0.2.11

## 기능 완료 조건

### 문제1: TOOL_DEFINITIONS 분리

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1a | `ToolDefinition` interface가 `ai-tool-schema.ts`에 존재 | `rg 'export interface ToolDefinition' packages/daemon/src/ai-tool-schema.ts` 1건 |
| F1b | `TOOL_DEFINITIONS` const가 `ai-tool-schema.ts`에 존재 | `rg 'export const TOOL_DEFINITIONS' packages/daemon/src/ai-tool-schema.ts` 1건 |
| F1c | `tool-surface.ts`에서 `ToolDefinition` 정의 제거됨 | `rg 'export interface ToolDefinition' packages/daemon/src/tool-surface.ts` 결과 0건 |
| F1d | `openclaw-client.ts`가 `ai-tool-schema.ts`에서 import | `rg "from './ai-tool-schema" packages/daemon/src/openclaw-client.ts` 1건 |
| F1e | `tool-call-loop.ts`가 `ai-tool-schema.ts`에서 import (TOOL_DEFINITIONS 사용) | `rg "TOOL_DEFINITIONS.*from.*ai-tool-schema\|from.*ai-tool-schema.*TOOL_DEFINITIONS" packages/daemon/src/tool-call-loop.ts` 또는 `rg "from './ai-tool-schema" packages/daemon/src/tool-call-loop.ts` 1건 |

### 문제2: Cron 타입 통합

| # | 조건 | 검증 방법 |
|---|------|----------|
| F2a | `CronBase` interface 존재 | `rg 'interface CronBase' packages/daemon/src/cron-scheduler.ts` 1건 |
| F2b | `CronEntry`가 CronBase를 extends | `rg 'CronEntry extends CronBase' packages/daemon/src/cron-scheduler.ts` 1건 |
| F2c | `CronRegistration`이 CronBase 기반 파생 (수동 필드 복제 아님) | `rg 'CronRegistration.*(=.*CronBase\|extends CronBase\|Pick.*CronBase\|Omit.*CronBase)' packages/daemon/src/cron-scheduler.ts` 1건 |
| F2d | `CronListItem`이 CronBase 기반 파생 (수동 필드 복제 아님) | `rg 'CronListItem.*=.*Pick\|CronListItem.*extends\|CronListItem.*=.*Omit' packages/daemon/src/cron-scheduler.ts` 1건 |

### 문제3: Queue 타입 유도

| # | 조건 | 검증 방법 |
|---|------|----------|
| F3 | `PendingMessageRequest`가 Omit 유도형 | `rg 'Omit<QueuedMessage' packages/daemon/src/message-queue.ts` 1건 |

### 문제4: CronScheduler 느슨화

| # | 조건 | 검증 방법 |
|---|------|----------|
| F4a | CronScheduler가 MessageQueueManager를 import하지 않음 | `rg 'MessageQueueManager' packages/daemon/src/cron-scheduler.ts` 결과 0건 |
| F4b | CronScheduler가 processChat을 import하지 않음 | `rg 'processChat' packages/daemon/src/cron-scheduler.ts` 결과 0건 |
| F4c | CronScheduler가 OpenClawClient를 import하지 않음 | `rg 'OpenClawClient' packages/daemon/src/cron-scheduler.ts` 결과 0건 |
| F4d | CronScheduler constructor에 CronDispatch 콜백 존재 | `rg 'dispatch: CronDispatch' packages/daemon/src/cron-scheduler.ts` 1건 |
| F4e | index.ts에서 CronDispatch 타입의 콜백 함수가 정의되어 CronScheduler에 전달됨 | `rg -A5 'CronDispatch\|cronDispatch' packages/daemon/src/index.ts` 에서 콜백 정의 + CronScheduler 생성자 전달 확인 |

### 문제5: Options 분리

| # | 조건 | 검증 방법 |
|---|------|----------|
| F5a | `CronSchedulerConfig` interface에 `tickIntervalMs` 필드만 존재 | `rg -A5 'interface CronSchedulerConfig' packages/daemon/src/cron-scheduler.ts` 후 필드 1개 확인 |
| F5b | `CronSchedulerOptions` 이름이 코드에 없음 | `rg 'CronSchedulerOptions' packages/daemon/src/ --type ts` 결과 0건 |
| F5c | `AdminServerConfig` interface에 `socketPath` 필드만 존재 | `rg -A5 'interface AdminServerConfig' packages/daemon/src/admin-server.ts` 후 필드 1개 확인 |
| F5d | `AdminServerOptions` 이름이 코드에 없음 | `rg 'AdminServerOptions' packages/daemon/src/ --type ts` 결과 0건 |
| F5e | `AdminServerDeps`가 export되지 않음 | `rg 'export.*AdminServerDeps' packages/daemon/src/admin-server.ts` 결과 0건 |
| F5f | `AdminServerDeps`에 `wdkContext` 필드 없음 | `rg 'wdkContext' packages/daemon/src/admin-server.ts` 결과 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | daemon 패키지 타입 에러 0 | `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0. 현재 baseline 4개 에러는 v0.2.9/v0.2.10 선행 작업 또는 이번 Phase에서 해결. Step 5 시작 전 baseline 재확인 필요. |
| N2 | 타입 그래프 max depth ≤ 5 | `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json && npx tsx -e "const j=require('./docs/type-dep-graph/type-dep-graph.json');const ns=j.nodes.filter(n=>!n.isExternal);const d=new Map();function calc(id,v=new Set()){if(d.has(id))return d.get(id);if(v.has(id))return 0;v.add(id);const es=j.edges.filter(e=>e.from.id===id&&!e.to.isExternal);if(!es.length){d.set(id,0);return 0;}const r=Math.max(...es.map(e=>calc(e.to.id,v)))+1;d.set(id,r);return r;}for(const n of ns)calc(n.id);console.log('max depth:',Math.max(...ns.map(n=>d.get(n.id)\|\|0)));"` 출력 ≤ 5 |
| N3 | 순환 의존 0개 | `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json && npx tsx scripts/type-dep-graph/verify.ts` exit 0 |
| N4 | `AdminServerDeps` 노드가 그래프에 없음 | `rg 'AdminServerDeps' docs/type-dep-graph/type-dep-graph.json` 결과 0건 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | ai-tool-schema.ts를 openclaw-client.ts와 tool-call-loop.ts가 import (tool-surface.ts는 execution-only로 ai-tool-schema 직접 import 불필요) | 순환 의존 없음 | N3 verify 통과 |
| E2 | CronDispatch 콜백이 queue가 있을 때 enqueue 처리 | index.ts의 콜백 구현에서 queue 분기 존재 | `rg -A10 'CronDispatch' packages/daemon/src/index.ts` 후 enqueue 로직 확인 |

## 커버리지 매핑

### PRD 목표 → DoD

| PRD 목표 | DoD 항목 |
|----------|---------|
| ToolDefinition 소유권 명확화 | F1a, F1b, F1c, F1d, F1e |
| Cron 타입 중복 파생 구조화 | F2a, F2b, F2c, F2d |
| Queue 타입 중복 유도형 전환 | F3 |
| CronScheduler dispatch 비직접결합 | F4a, F4b, F4c, F4d, F4e |
| Options config/dependency 분리 | F5a, F5b, F5c, F5d, F5e, F5f, N2, N4 |

### 설계 결정 → DoD

| 설계 결정 | DoD 항목 |
|----------|---------|
| ai-tool-schema.ts 신규 생성 | F1a, F1b |
| tool-call-loop.ts import 이동 | F1e |
| CronBase + extends 패턴 | F2a, F2b |
| Omit 유도형 | F3 |
| processChat/OpenClawClient 제거 | F4b, F4c |
| CronDispatch 콜백 (Primitive First) | F4d |
| CronSchedulerConfig required | F5a |
| AdminServerDeps 비공개 | F5e |
| AdminServerDeps에서 wdkContext 제거 | F5f |
| max depth ≤ 5 | N2 |
