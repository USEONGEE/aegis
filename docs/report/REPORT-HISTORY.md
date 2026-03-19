# 리포트 히스토리

> docs/report 문서 생성 이력 관리

---

## 문서 목록

| 생성일시 (KST) | 파일명 | Why (목적) | How (방법) | What (내용) |
|---------------|--------|------------|------------|-------------|
| 2026-03-18 | [architecture-and-user-flow-summary.md](./architecture-and-user-flow-summary.md) | PRD 확정 후 의도대로 설계됐는지 검증 | PRD + Codex 4차 리뷰 결과 종합 | 3-tier 구조, 6개 컴포넌트 역할, 6개 유저 플로우 (A~F), 보안 모델, 데이터 스키마 |
| 2026-03-19 | [system-interaction-cases.md](./system-interaction-cases.md) | 모든 모듈 간 상호작용을 코드 레벨로 이해 | 실제 TS 소스 코드 14개 파일 분석 | 14개 케이스 (AUTO/APPROVAL/REJECT tx, policy 요청/승인/거부, device revoke, pairing, cron, reconnect, 중복 방지, 복구) + 보안 경계 |
