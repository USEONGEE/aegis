# 타입 시스템 리팩토링 - v0.1.4

## 문제 정의

### 현상
v0.1.0~v0.1.3에서 빠르게 구현하면서 쌓인 타입 설계 부채 8가지:

1. **camelCase/snake_case 중복 필드**: `CronInput.sessionId` + `session_id`, `HistoryEntry.seedId` + `seed_id` 등 — 한 인터페이스에 두 가지 네이밍이 혼재
2. **daemon 동시 질문 미제어**: OpenClaw는 세션당 질문 하나만 처리 가능한데, user message와 cron이 동시에 들어올 수 있음. session-level lock 없음
3. **PendingRequest 이름 모호**: 승인 대기(approval)와 메시지 대기(chat/cron)가 같은 이름
4. **chain: string vs chainId: number**: "ethereum" 문자열은 모호 (mainnet? sepolia?). chainId: number가 정확
5. **서명만 하는 함수 없음**: sendTransaction이 서명+전송+receipt까지 일괄 처리. 서명만 하고 전송은 나중에 하는 use case 불가
6. **wdk_countersig 불필요 필드**: SignedPolicy에 countersign 필드가 있지만 미구현이고, owner 서명만으로 충분
7. **permissions 배열 구조**: O(n) 순차 매칭. 딕셔너리 `{chainId:target}` → `{selector}` → `rules[]`가 O(1) lookup으로 효율적
8. **pending message 취소 불가**: 사용자가 대기 중인 자기 요청이나 cron 요청을 취소할 수 없음

### 원인
- v0.1.0에서 ZeroDev on-chain 패턴을 off-chain에 그대로 적용 (permissions 배열)
- v0.1.0에서 upstream WDK 패턴을 그대로 따름 (서명+전송 일체)
- 빠른 구현 우선으로 camelCase/snake_case 변환 레이어를 생략
- daemon 동시성 제어를 미루고 순차 처리만 구현

### 영향
- 코드 가독성 저하 (같은 필드가 두 가지 이름)
- 런타임 안전성 (cron + user 동시 질문 시 OpenClaw 상태 오염)
- 조회 성능 (permissions O(n))
- 사용자 경험 (pending 취소 불가, 서명만 하기 불가)

### 목표

| # | 변경 | 영향 패키지 |
|---|------|-----------|
| 1 | 내부 camelCase 통일 + DB 경계 변환 | guarded-wdk |
| 2 | daemon FIFO queue (user + cron 통합, session-level) | daemon |
| 3 | PendingApprovalRequest + PendingMessageRequest 이름 분리 | guarded-wdk, daemon |
| 4 | pending message 취소 기능 | daemon, app |
| 5 | chainId: number 통일 | 전 패키지 |
| 6 | signTransaction() 분리 + "signed" 상태 추가 | guarded-wdk |
| 7 | wdk_countersig 제거 | guarded-wdk |
| 8 | permissions 딕셔너리 구조 전환 | guarded-wdk, manifest |

### 비목표 (Out of Scope)
- Gap 1~22 중 위 8개에 해당하지 않는 Gap (별도 Phase)
- E2E pairing 완성 (Gap 3, 11, 16)
- approval context 전달 (Gap 2)
- app executor type-blind 수정 (Gap 10)
- 기존 stored data의 마이그레이션 도구 (Phase 1 데이터가 없으므로 reset 허용)

## 제약사항
- **리팩토링 항목** (1, 3, 5, 7, 8): 동작 변경 없이 구조만 변경. 기존 테스트 유지/수정.
- **신규 기능 항목** (2 FIFO queue, 4 pending 취소, 6 signTransaction 분리): 새 동작 추가. 새 테스트 필요.
- breaking change 허용 (내부 인터페이스)
- **저장 포맷**: 기존 JSON/SQLite 데이터는 reset 허용 (Phase 1 데이터가 아직 프로덕션에 없으므로). schema 변경 시 기존 DB 파일 삭제 + 재생성.
- guarded-wdk의 evaluatePolicy 핵심 로직은 유지하되 입력/출력 구조만 변경

## 참조
- **Gap 분석**: `docs/report/system-interaction-cases.md` (Gap 1~22)
- **현재 아키텍처**: `docs/report/architecture-and-user-flow-summary.md`
- **타입 그래프**: `docs/type-dep-graph/` (101 nodes, 153 edges)
- **PRD**: `docs/PRD.md`
