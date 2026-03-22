# 리포트 히스토리

> docs/report 문서 생성 이력 관리

---

## 문서 목록

| 생성일시 (KST) | 파일명 | Why (목적) | How (방법) | What (내용) |
|---------------|--------|------------|------------|-------------|
| 2026-03-22 | [relay-domain-aggregate-analysis.md](./relay-domain-aggregate-analysis.md) | relay 패키지를 도메인 중심으로 분석 | 타입 그래프(32 nodes, 57 edges) + 설계 문서 대조 + 코드 분석 | 5개 도메인 Aggregate(Registry/Queue/Auth/Socket/RateLimit) + 3축(인증&바인딩/메시지중계/오프라인복구) + 3시나리오. v0.4.7 dead export 정리 반영 |
| 2026-03-22 | [guarded-wdk-architecture-one-pager.md](./guarded-wdk-architecture-one-pager.md) | guarded-wdk 패키지 아키텍처 정리 | 타입 그래프(39 nodes, 84 edges) + 13개 소스 파일 전체 분석 | 5개 도메인(Policy/Approval/Journal/WdkStore/Crypto) + 3축(정책평가/승인처리/보호조립). v0.4.6 store 분리(WdkStore, cron 제거, journal 내부화) + v0.4.7 dead export 반영 |
| 2026-03-22 | [daemon-architecture-one-pager.md](./daemon-architecture-one-pager.md) | daemon 패키지 아키텍처 정리 | 타입 그래프(41 nodes, 50 edges) + 17개 소스 파일 전체 분석 | 4개 도메인(Tool/Message/Relay/Cron) + 3축(AI대화루프/제어채널/자동화인프라). v0.4.6 DaemonStore 추가, facade port 패턴, Journal→WDK 이동, store 경계 해결 |
| 2026-03-22 | [app-architecture-one-pager.md](./app-architecture-one-pager.md) | app 패키지 아키텍처 정리 | 타입 그래프(31 nodes, 27 edges) + 23개 소스 파일 전체 분석 | 5개 도메인(Approval/Chat/Identity&Crypto/Relay/Policy) + 3축(AI대화/서명승인/실시간동기화) + 3시나리오 |

## 갱신 이력

| 갱신일시 (KST) | 파일명 | Phase | 변경 내용 |
|---------------|--------|-------|----------|
| 2026-03-22 | daemon-architecture-one-pager.md | v0.4.8 | 제어채널 축 전면 수정(ControlResult→CancelEventPayload), 통신채널 맵 5채널 구조로 갱신, query 채널+QueryFacadePort 추가, 직접 forward 제거, 알려진 문제 3건 해결됨 |
| 2026-03-22 | relay-domain-aggregate-analysis.md | v0.4.8 | Socket 도메인: 직접 forward 제거+event_stream 변환+query 라우팅. 축B 메시지 중계 전면 갱신. 시나리오2 Redis 단일 경로 반영 |
| 2026-03-22 | app-architecture-one-pager.md | v0.4.8 | RelayChannel 5종, query()+pendingQueries, event_stream top-level 분리, CancelCompleted/CancelFailed 수신 |
| 2026-03-23 | daemon-architecture-one-pager.md | v0.5.3, v0.5.4 | AI 클라이언트 재작성 (OpenAI SDK → raw fetch OpenResponses API, 어댑터 패턴 4함수), wallet address 컬럼 제거, config socketPath 환경변수 |
| 2026-03-23 | relay-domain-aggregate-analysis.md | v0.5.0 | backfill→poll 갭 제거 (lastId 기반 전환), pollChatForApp XREAD BLOCK → readRange+sleep(200), subscribe_chat continuous polling, 시나리오 2,3 갱신 |
| 2026-03-23 | app-architecture-one-pager.md | v0.5.0 | sendChat(sessionId, text) 시그니처 변경 (RelayChatInput), subscribedSessions Set (중복 subscribe 방지), 축1/시나리오1 갱신 |
| 2026-03-23 | daemon-architecture-one-pager.md | Codex 검수 | 도구 12→15개, OpenClawClient chat()만 존재, tool-call 루프→OpenClaw 내부 관리+ToolApiServer HTTP 콜백, chat 하위타입 4종, 19개 파일, facade nullable, ai-tool-schema.ts 추가 |
| 2026-03-23 | relay-domain-aggregate-analysis.md | Codex 검수 | 인증 경로 /auth/ prefix, audience→없음, chat 직접 forward 자기모순 해소, event_stream=가상채널 명확화, PgRegistryOptions, unbind/deviceId/consumer-group 추가 |
| 2026-03-23 | app-architecture-one-pager.md | Codex 검수 | enum→literal union, SignedApproval flat, count→messageCount, typing/done UI only, event_stream 가상채널, 14→15종, ApprovalRequest 필드, forPolicyReject, targetHash 파생, optimistic update |

---

## 삭제 이력

| 삭제일 | 파일명 | 사유 |
|--------|--------|------|
| 2026-03-22 | architecture-and-user-flow-summary.md | v0.3.4 pairing 제거, v0.4.2 이벤트 변경 등 현재 코드와 괴리 |
| 2026-03-22 | system-interaction-cases.md | pairing/canonical 다수 참조, v0.3.x~v0.4.x 이후 상호작용 패턴 대폭 변경 |
| 2026-03-22 | app-chat-ux-handover.md | v0.3.1 완료로 인수인계 목적 달성 |
| 2026-03-22 | daemon-architecture-one-pager.md | 제거된 PairingConfirmPayload/PairingSession 참조, v0.4.x 미반영 |
| 2026-03-22 | daemon-domain-aggregate-analysis.md | PairingSession 등 v0.3.4 제거 개념을 핵심 Aggregate로 분석 |
