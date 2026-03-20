# Daemon 타입 인프라 정리 - v0.2.11

## 문제 정의

### 현상
Daemon 패키지의 타입 인프라에 여러 중간 우선순위 문제가 산재해 있다.

1. **TOOL_DEFINITIONS 위치**: OpenAI function calling transport schema(`ToolDefinition`)가 execution 모듈(`tool-surface.ts`)에 있고, `openclaw-client.ts`가 이를 역방향 import. `TOOL_DEFINITIONS` const는 타입이 아닌 런타임 값인데 타입 그래프 Layer 1에 포함됨.

2. **Cron 타입 3중 복제**: `CronEntry`, `CronRegistration`, `CronListItem`이 거의 동일한 필드를 수동 복제. 필드 추가/변경 시 3곳 동시 수정 필요.

3. **Queue 타입 중복**: `PendingMessageRequest`가 `QueuedMessage`의 투영인데 별도 인터페이스로 정의. `Omit`으로 유도 가능.

4. **CronScheduler 직접 결합**: `CronScheduler`가 `MessageQueueManager`를 직접 참조하여 scheduling과 dispatch strategy를 동시에 앎. 콜백/포트로 느슨화 가능.

5. **Depth inflation**: `CronSchedulerOptions`가 `queueManager` 하나 때문에 L4, `AdminServerOptions`가 `CronScheduler` 때문에 L6. Options 내 config와 dependency가 혼재. 실제 개념 깊이는 4~5인데 그래프가 7까지 부풀림.

### 원인
- 초기 구현에서 "일단 동작하게" 타입을 정의한 후 정리하지 않음
- Options 타입에 config 값과 서비스 참조를 혼합
- Cron 관련 타입이 단계별로 추가되면서 공통 base 없이 복제

### 영향
1. **유지보수 비용**: Cron 필드 하나 추가하면 3곳 수정 + 2곳 변환 코드 수정
2. **모듈 경계 혼란**: ToolDefinition이 execution과 client 양쪽에 걸쳐 소유권 불명확
3. **그래프 과장**: 실제보다 2 depth 깊게 표현되어 아키텍처 해석에 노이즈
4. **결합도**: CronScheduler가 queue 있으면 enqueue, 없으면 direct processChat — dispatch 전략을 직접 앎

### 목표
- `ToolDefinition` + `TOOL_DEFINITIONS`를 `ai-tool-schema.ts`로 분리, 소유권 명확화
- `CronBase` 도입 → `CronEntry`, `CronRegistration`, `CronListItem`을 Pick/Omit/확장으로 파생
- `PendingMessageRequest`를 `Omit<QueuedMessage, 'userId' | 'abortController'>`로 유도
- `CronScheduler`의 dispatch를 콜백/포트로 느슨화
- `CronSchedulerOptions`와 `AdminServerOptions`에서 config와 dependency 분리

### 비목표 (Out of Scope)
- ToolResult/ControlPayload union 분리 (v0.2.9)
- WDKContext 분해 (v0.2.10)
- 도구 자체의 기능 변경
- Relay 프로토콜 변경

## 제약사항
- v0.2.9, v0.2.10 완료 후 진행 (선행 리팩토링이 타입 구조에 영향)
- Breaking change 허용
- daemon 패키지 내부 리팩토링
