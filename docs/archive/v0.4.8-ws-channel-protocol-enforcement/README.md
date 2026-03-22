# WS 채널 재설계 + Protocol 타입 강제 적용 - v0.4.8

## 문제 정의

### 현상

**1. 채널 방향 비일관성**
- control이 양방향으로 사용됨. 승인 6종 결과는 event_stream, cancel 2종 결과는 control로 돌아옴
- app에서 결과를 받으려면 event_stream과 control 두 곳을 봐야 하는 비일관성

**2. 메시지 중복 수신**
- relay가 직접 forward + Redis polling 이중 경로로 메시지 전달
- 온라인 상태에서 같은 메시지가 2번 도착할 수 있음. dedup 로직 없음

**3. 데이터 조회 경로 부재**
- app에서 정책 목록, tx 이력, 서명자 목록 등을 조회하려면 AI에게 채팅으로 물어봐야 함
- usePolicyStore, useApprovalStore 등에 setter만 있고 fetch 로직 없음
- 정책 화면, tx 현황, 서명자/지갑 관리 화면이 빈 상태

**4. protocol 타입 미적용**
- daemon/relay/app이 메시지 송수신 시 protocol 패키지의 공유 타입을 import하지 않고 리터럴로 직접 작성
- protocol 타입을 수정해도 소비자가 따라가지 않아서 타입 안전성이 없음
- protocol이 문서 역할만 하고 컴파일 타임 체크를 제공하지 못함

### 원인

**채널 비일관성**: v0.4.2에서 승인 6종을 event_stream으로 전환했지만, cancel 2종은 그대로 control에 남아서 양방향이 됨.

**이중 전달**: relay가 "온라인이면 즉시 전달, 오프라인이면 나중에 복구"를 위해 직접 forward + Redis XADD를 동시에 실행. 온라인 상태에서 Redis poller도 동시에 돌아서 중복 발생.

**조회 경로 부재**: app→daemon 통신이 chat(AI 대화)과 control(승인/취소)만 존재. 데이터 조회 전용 채널이 설계되지 않음.

**타입 미적용**: protocol 패키지가 만들어졌지만, 소비자(daemon/relay/app)가 import 없이 리터럴로 직접 작성하는 관행이 그대로 유지됨.

### 영향

- **런타임 에러**: protocol 타입과 실제 메시지 구조가 어긋나도 컴파일 에러가 안 남. 필드 누락, 오타가 런타임까지 가야 발견됨
- **중복 처리**: 같은 메시지를 2번 받아서 app에서 이중 처리 가능성
- **UX 불능**: 정책/이력/서명자/지갑 화면에 데이터를 표시할 수 없음 — AI 채팅 의존
- **유지보수 비용**: protocol 타입 수정 시 소비자가 따라가지 않아서 변경의 의미가 없어짐
- **코드 비일관성**: app에서 결과를 받는 경로가 채널마다 달라서 핸들링 로직이 복잡

### 목표

이 Phase가 완료되면:

1. **채널 단방향 통일**: control은 app→daemon 단방향, event_stream은 daemon→app 단방향
2. **단일 전달 경로**: 영속 채널(chat, control, event_stream)은 Redis XADD → poller XREAD 단일 경로. 직접 forward 제거
3. **query 채널 신설**: app이 daemon에게 데이터를 직접 조회할 수 있는 query/query_result 채널. WS 직접 전달 (Redis 미경유 — 영속 불필요). 초기 query 대상은 `policyList`, `pendingApprovals`, `signerList`, `walletList` 4종
4. **protocol 타입 강제**: daemon/relay/app 모든 메시지 송수신에서 protocol 타입 import + 적용. 컴파일 타임 체크 확보

최종 채널 구조:

| 타입 | 방향 | 용도 |
|------|------|------|
| `chat` | 양방향 | AI 대화 (typing, stream, tool_start, tool_done, done) |
| `control` | app → daemon 단방향 | 승인 6종 + 취소 2종 (요청만) |
| `event_stream` | daemon → app 단방향 | WDK 이벤트 14종 + cancel 결과 (알림) |
| `query` | app → daemon 단방향 | 데이터 조회 요청 |
| `query_result` | daemon → app 단방향 | 조회 응답 |

### 비목표 (Out of Scope)

- 연결 시 전체 동기화 방식 (push) — query로 화면 진입 시마다 최신 데이터를 가져오면 충분
- cursor 기반 replay — 복잡도 증가 대비 이점 없음
- CI 체크 (protocol 타입 우회 감지) — 타입 강제 적용 이후 별도 검토
- chat 채널 변경 — 이미 양방향으로 안정적
- Redis Streams 구조 변경 (스트림 키 재설계 등)
- 런타임 메시지 검증 (zod 등) — 이번 Phase는 컴파일 타임 타입 체크만 목표
- 혼합 버전 호환 — 동시 배포 전제 (Breaking change 적극 허용 원칙)

## 제약사항

- cancel 이벤트(CancelCompleted/CancelFailed)는 WDK 이벤트가 아님 — daemon 자체 이벤트. `AnyWDKEvent` union에 포함하지 말 것
- relay의 pushToOfflineApps()는 직접 forward와 무관 — Redis XADD 후 호출이므로 영향 없음
- query/query_result는 WS 직접 전달 — Redis 미경유, 영속 불필요 (재연결 시 화면 재진입하면 다시 query)
- 동시 배포 전제 — app/relay/daemon을 한 번에 배포. 구버전 혼합 호환 불필요
- Scope A(ws-channel-redesign)가 완료된 뒤 Scope B(protocol-type-enforcement) 착수 — 채널 구조 확정 후 타입 강제
- store 분리(v0.4.6)와 병행 시 query handler에서 store 직접 접근으로 우선 구현 후 리팩토링

## 선행 Phase

| Phase | 상태 | 영향 |
|-------|------|------|
| v0.4.4 App WDK 이벤트 마이그레이션 | 완료 | event_stream 수신 패턴 확립 |
| v0.4.6 Store 경계 분리 | Step 5 대기 | query handler store 접근 구조에 영향. 병행 가능 |
