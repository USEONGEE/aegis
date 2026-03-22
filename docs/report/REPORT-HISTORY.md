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

---

## 삭제 이력

| 삭제일 | 파일명 | 사유 |
|--------|--------|------|
| 2026-03-22 | architecture-and-user-flow-summary.md | v0.3.4 pairing 제거, v0.4.2 이벤트 변경 등 현재 코드와 괴리 |
| 2026-03-22 | system-interaction-cases.md | pairing/canonical 다수 참조, v0.3.x~v0.4.x 이후 상호작용 패턴 대폭 변경 |
| 2026-03-22 | app-chat-ux-handover.md | v0.3.1 완료로 인수인계 목적 달성 |
| 2026-03-22 | daemon-architecture-one-pager.md | 제거된 PairingConfirmPayload/PairingSession 참조, v0.4.x 미반영 |
| 2026-03-22 | daemon-domain-aggregate-analysis.md | PairingSession 등 v0.3.4 제거 개념을 핵심 Aggregate로 분석 |
