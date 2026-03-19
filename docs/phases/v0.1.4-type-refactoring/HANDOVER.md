# 인수인계서 — v0.1.4 타입 시스템 리팩토링

> 이 문서는 v0.1.4를 이어받을 다음 세션/에이전트를 위한 맥락 전달 문서입니다.

---

## 현재 상태

- **Step 1 (PRD)**: ✅ Codex 통과
- **Step 2~5**: 미시작
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.1.4-type-refactoring`

---

## 프로젝트 배경

WDK-APP은 AI DeFi Agent 서명 엔진 + 제어 인프라 플랫폼. 6개 패키지 모노레포:

```
packages/
  canonical/      ← 해시 계산 (sortKeysDeep, intentHash, policyHash)
  guarded-wdk/    ← 서명 엔진 (policy 평가 + 승인 검증 + 영속 저장)
  manifest/       ← policy 카탈로그 (DeFi CLI용)
  daemon/         ← orchestration host (OpenClaw + Relay 브릿지)
  relay/          ← 중앙 메시지 서버 (Redis + PostgreSQL)
  app/            ← RN App (Expo, 모바일 제어판)
```

**v0.1.0**: 전체 스택 구현 (242 테스트)
**v0.1.1**: manifest 역할 재정의 (문서 수정)
**v0.1.2**: JS → TS 마이그레이션
**v0.1.3**: CI 체크 7개 + type-dep-graph + Claude 스킬 2개

---

## 이번 Phase에서 할 것 (8가지)

### 리팩토링 항목 (동작 변경 없음)

**1. camelCase/snake_case 통일**
- 현재: `CronInput`에 `sessionId` + `session_id` 둘 다 있음. `HistoryEntry`도 마찬가지.
- 변경: 내부는 camelCase만 사용. DB 경계(JsonApprovalStore, SqliteApprovalStore)에서 snake↔camel 변환.
- 파일: `approval-store.ts` (인터페이스), `json-approval-store.ts`, `sqlite-approval-store.ts`

**3. PendingRequest 이름 분리**
- 현재: `PendingRequest` 하나가 승인 대기와 메시지 대기를 모두 표현
- 변경: `PendingApprovalRequest` (policy/tx 승인 대기) + `PendingMessageRequest` (chat/cron 질문 대기)
- 파일: `approval-store.ts`, `signed-approval-broker.ts`, daemon 전체

**5. chainId: number 통일**
- 현재: `chain: string` ("ethereum")
- 변경: `chainId: number` (1, 42161, 11155111)
- 영향: 전 패키지. SignedApproval, Policy, ApprovalRequest, ChainPolicies 등 모든 chain 필드

**7. wdk_countersig 제거**
- 현재: `SignedPolicy`에 `wdk_countersig` 필드가 있지만 미구현
- 변경: 필드 삭제. owner 서명만으로 충분 (off-chain이라 이중 서명 불필요)
- 파일: `approval-store.ts` (인터페이스)

**8. permissions 딕셔너리**
- 현재: `CallPolicy.permissions: Permission[]` — O(n) 순차 매칭
- 변경: `{ [chainId:target]: { [selector]: Rule[] } }` — O(1) lookup + 규칙 내 순차 매칭
- 영향: `guarded-middleware.ts` (evaluatePolicy), `manifest/manifest-to-policy.ts`, 테스트 전부

### 신규 기능 항목 (새 동작 + 새 테스트)

**2. daemon FIFO queue**
- 현재: user message와 cron이 각각 processChat() 호출 → session-level 동시성 위험
- 변경: session별 FIFO queue. user message + cron message 통합. 순서대로 consumer가 처리.
- 흐름: `RN App → Relay → daemon → queue → consumer → OpenClaw`
- 연결 끊겨도 queue는 유지
- 파일: daemon에 `message-queue.ts` (신규) + `chat-handler.ts`, `cron-scheduler.ts` 수정

**4. pending message 취소**
- 현재: 사용자가 대기 중인 질문을 취소할 수 없음
- 변경: RN App에서 pending message/cron 요청을 control channel로 취소 가능
- 파일: daemon `message-queue.ts`, app 관련 화면

**6. signTransaction 분리**
- 현재: `account.sendTransaction()` = 서명 + 전송 + receipt polling 일체
- 변경: `account.signTransaction(tx)` → `{ signedTx }` (서명만). 전송은 선택.
- 상태 추가: journal에 "signed" 상태. `signed → broadcasted → settled`
- 파일: `guarded-middleware.ts`, `execution-journal` 관련

---

## 핵심 참조 파일

| 용도 | 파일 |
|------|------|
| PRD (이번 Phase) | `docs/phases/v0.1.4-type-refactoring/README.md` |
| Gap 분석 (22개) | `docs/report/system-interaction-cases.md` |
| 전체 아키텍처 | `docs/report/architecture-and-user-flow-summary.md` |
| 확정 PRD | `docs/PRD.md` |
| 타입 그래프 | `docs/type-dep-graph/type-dep-graph.json` (101 nodes, 153 edges) |
| CI 체크 | `scripts/check/` (7개 PASS) |
| 테스트 | `npm test` (242 passed) |

---

## 워크플로우

`/codex-phase-workflow` 사용. Codex Session ID는 PROGRESS.md에 있음.

- **Step 2 (Design)**: 8가지 변경의 구체적 설계. 특히 permissions 딕셔너리 구조, FIFO queue 인터페이스, signTransaction API.
- **Step 3 (DoD)**: 리팩토링 5개는 기존 테스트 통과 확인, 신규 3개는 새 테스트 정의.
- **Step 4 (Tickets)**: 8개 변경을 의존성 순서로 분할. permissions(8) → chainId(5) → camelCase(1) → countersig 제거(7) → PendingRequest 분리(3) → FIFO queue(2) → 취소(4) → signTransaction(6)
- **Step 5 (개발)**: 순서대로 구현.

---

## 주의사항

1. **저장 포맷 reset 허용**: Phase 1 데이터가 프로덕션에 없으므로 schema 변경 시 DB 삭제 + 재생성.
2. **permissions 변경이 가장 영향 큼**: evaluatePolicy + manifest + 모든 테스트가 연쇄 수정.
3. **chainId 통일도 영향 큼**: 전 패키지의 `chain: string` → `chainId: number`.
4. **기존 CI 체크 7개가 PASS 유지되어야 함**: `npx tsx scripts/check/index.ts` → 7/7.
5. **type-dep-graph 재생성 필요**: 구조 변경 후 `npm run type-graph:json`.
