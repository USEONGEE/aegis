# 작업 티켓 - v0.2.11

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | TOOL_DEFINITIONS 분리 (문제 1) | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | Queue 타입 유도형 전환 (문제 3) | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | Cron 타입 통합 (문제 2) | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | CronScheduler 느슨화 (문제 4) | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | Options depth 분리 (문제 5) | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 (TOOL_DEFINITIONS 분리)    ─────────────────── 독립
02 (Queue 타입 유도형 전환)    ─────────────────── 독립
03 (Cron 타입 통합)           ─────────────────── 독립
                                        │
                                        ▼
04 (CronScheduler 느슨화)     ← 03 이후 (CronBase 기반)
                                        │
                                        ▼
05 (Options depth 분리)       ← 04 이후 (dispatch 콜백 확정 후)
```

- Step 01, 02, 03은 상호 독립 -- 병렬 또는 순서 무관하게 진행 가능
- Step 04는 Step 03 완료 필수 (Cron 타입이 정리된 상태에서 dispatch 패턴 변경)
- Step 05는 Step 04 완료 필수 (dispatch 콜백 패턴이 확정되어야 Options 재구성 가능)

## 파일 변경 매트릭스

| 파일 | Step 01 | Step 02 | Step 03 | Step 04 | Step 05 |
|------|---------|---------|---------|---------|---------|
| `src/ai-tool-schema.ts` | **생성** | - | - | - | - |
| `src/tool-surface.ts` | 수정 | - | - | - | - |
| `src/openclaw-client.ts` | 수정 | - | - | - | - |
| `src/tool-call-loop.ts` | 수정 | - | - | - | - |
| `src/message-queue.ts` | - | 수정 | - | - | - |
| `src/cron-scheduler.ts` | - | - | 수정 | 수정 | 수정 |
| `src/admin-server.ts` | - | - | - | - | 수정 |
| `src/index.ts` | - | - | - | 수정 | 수정 |

**총**: 1개 생성, 7개 수정 (design.md와 일치)

## 커버리지 매트릭스

### PRD 목표 -> 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| ToolDefinition + TOOL_DEFINITIONS를 ai-tool-schema.ts로 분리, 소유권 명확화 | Step 01 | ✅ |
| CronBase 도입, CronEntry/CronRegistration/CronListItem을 파생으로 | Step 03 | ✅ |
| PendingMessageRequest를 Omit 유도형으로 | Step 02 | ✅ |
| CronScheduler의 dispatch를 콜백으로 느슨화 | Step 04 | ✅ |
| CronSchedulerOptions와 AdminServerOptions에서 config/dependency 분리 | Step 05 | ✅ |

### DoD -> 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1a: ToolDefinition이 ai-tool-schema.ts에 존재 | Step 01 | ✅ |
| F1b: TOOL_DEFINITIONS가 ai-tool-schema.ts에 존재 | Step 01 | ✅ |
| F1c: tool-surface.ts에서 ToolDefinition 제거 | Step 01 | ✅ |
| F1d: openclaw-client.ts가 ai-tool-schema에서 import | Step 01 | ✅ |
| F1e: tool-call-loop.ts가 ai-tool-schema에서 import | Step 01 | ✅ |
| F2a: CronBase interface 존재 | Step 03 | ✅ |
| F2b: CronEntry extends CronBase | Step 03 | ✅ |
| F2c: CronRegistration이 CronBase 기반 파생 | Step 03 | ✅ |
| F2d: CronListItem이 CronBase 기반 파생 | Step 03 | ✅ |
| F3: PendingMessageRequest가 Omit 유도형 | Step 02 | ✅ |
| F4a: CronScheduler가 MessageQueueManager를 import하지 않음 | Step 04 | ✅ |
| F4b: CronScheduler가 processChat을 import하지 않음 | Step 04 | ✅ |
| F4c: CronScheduler가 OpenClawClient를 import하지 않음 | Step 04 | ✅ |
| F4d: CronScheduler constructor에 CronDispatch 존재 | Step 04 | ✅ |
| F4e: index.ts에서 cronDispatch 콜백 정의 후 전달 | Step 04 | ✅ |
| F5a: CronSchedulerConfig에 tickIntervalMs만 | Step 05 | ✅ |
| F5b: CronSchedulerOptions 이름 없음 | Step 05 | ✅ |
| F5c: AdminServerConfig에 socketPath만 | Step 05 | ✅ |
| F5d: AdminServerOptions 이름 없음 | Step 05 | ✅ |
| F5e: AdminServerDeps가 export되지 않음 | Step 05 | ✅ |
| F5f: AdminServerDeps에 wdkContext 없음 | Step 05 | ✅ |
| N1: daemon 타입 에러 0 | Step 01~05 (매 Step 빌드 검증) | ✅ |
| N2: 타입 그래프 max depth <= 5 | Step 05 (최종 검증) | ✅ |
| N3: 순환 의존 0개 | Step 01 (선행 검증) | ✅ |
| N4: AdminServerDeps 노드가 그래프에 없음 | Step 05 | ✅ |
| E1: ai-tool-schema 순환 의존 없음 | Step 01 | ✅ |
| E2: CronDispatch 콜백이 enqueue 처리 | Step 04 | ✅ |

### 설계 결정 -> 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| ai-tool-schema.ts 신규 파일로 분리 (대안 A) | Step 01 | ✅ |
| CronBase + extends 패턴 (대안 A) | Step 03 | ✅ |
| CronRegistration을 type alias로 유지 | Step 03 | ✅ |
| PendingMessageRequest를 Omit으로 유도 (대안 A) | Step 02 | ✅ |
| dispatch 콜백 방식 (대안 A, Primitive First) | Step 04 | ✅ |
| CronSchedulerConfig (required, queueManager 제거) | Step 05 | ✅ |
| AdminServerConfig + AdminServerDeps 분리 (대안 A-1) | Step 05 | ✅ |
| AdminServerDeps 비공개 (export 안 함) | Step 05 | ✅ |
| AdminServerDeps에서 wdkContext 제거 | Step 05 | ✅ |

## Step 상세
- [Step 01: TOOL_DEFINITIONS 분리](step-01-tool-definitions-split.md)
- [Step 02: Queue 타입 유도형 전환](step-02-queue-type-derive.md)
- [Step 03: Cron 타입 통합](step-03-cron-type-unify.md)
- [Step 04: CronScheduler 느슨화](step-04-cron-scheduler-decouple.md)
- [Step 05: Options depth 분리](step-05-options-depth-split.md)
