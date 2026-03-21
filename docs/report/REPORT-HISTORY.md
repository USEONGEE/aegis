# 리포트 히스토리

> docs/report 문서 생성 이력 관리

---

## 문서 목록

| 생성일시 (KST) | 파일명 | Why (목적) | How (방법) | What (내용) |
|---------------|--------|------------|------------|-------------|
| 2026-03-18 | [architecture-and-user-flow-summary.md](./architecture-and-user-flow-summary.md) | PRD 확정 후 의도대로 설계됐는지 검증 | PRD + Codex 4차 리뷰 결과 종합 | 3-tier 구조, 6개 컴포넌트 역할, 6개 유저 플로우 (A~F), 보안 모델, 데이터 스키마 |
| 2026-03-19 | [system-interaction-cases.md](./system-interaction-cases.md) | 모든 모듈 간 상호작용을 코드 레벨로 이해 | 실제 TS 소스 코드 14개 파일 분석 | 14개 케이스 (AUTO/APPROVAL/REJECT tx, policy 요청/승인/거부, device revoke, pairing, cron, reconnect, 중복 방지, 복구) + 보안 경계 |
| 2026-03-21 | [daemon-architecture-one-pager.md](./daemon-architecture-one-pager.md) | v0.2.9~v0.2.11 리팩토링 후 daemon 구조 정리 | 타입 의존성 그래프(75 nodes, 109 edges) 기반 축 도출 + 실제 코드 분석 | 4축 구조 (AI 대화 루프, 도구 실행, 제어 채널, 인프라), 65개 내부 타입 매핑, 4개 시나리오, max depth 3 |
| 2026-03-21 | [app-chat-ux-handover.md](./app-chat-ux-handover.md) | App 채팅 UX 미완성 항목 인수인계 | Explore Agent로 app/src/ 15개 파일 분석 + daemon 채팅 인프라 대조 | 5가지 미구현 항목 (세션 목록, tool calls 표시, cron 표시, 수신 흐름 UX, 대화 이력 영속성) + daemon/app 변경 목록 + 우선순위 |
