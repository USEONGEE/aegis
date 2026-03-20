# DoD (Definition of Done) - v0.2.5

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `Decision = 'ALLOW' \| 'REJECT'` — `AUTO`/`REQUIRE_APPROVAL` 제거 | guarded-middleware.ts에서 `Decision` 타입 확인 + `AUTO`/`REQUIRE_APPROVAL` 검색 0건 |
| F2 | `JournalStatus`에서 `pending_approval` 제거 | approval-store.ts에서 JournalStatus 확인 |
| F3 | middleware REQUIRE_APPROVAL 분기 전체 제거 | guarded-middleware.ts에서 `REQUIRE_APPROVAL` 검색 0건 |
| F4 | middleware `waitForApproval` 호출 제거 | guarded-middleware.ts에서 `waitForApproval` 검색 0건 |
| F5 | middleware `ApprovalRequested` 이벤트 emit 제거 | guarded-middleware.ts에서 `ApprovalRequested` 검색 0건 |
| F6 | `MiddlewareConfig.approvalBroker` 제거 | guarded-middleware.ts에서 `approvalBroker` 검색 0건 |
| F7 | daemon tool-surface에서 REJECT 시 `store.saveRejection()` 호출 | tool-surface.test.ts에서 PolicyRejectionError catch 후 saveRejection 호출 검증 |
| F8 | rejection 이력의 `intentHash`가 journal/tool 응답의 `intentHash`와 동일 | tool-surface.test.ts에서 rejected 응답의 intentHash === saveRejection 호출의 intentHash 확인 |
| F9 | `SignedApprovalBroker.waitForApproval()` 삭제 | signed-approval-broker.ts에서 `waitForApproval` 검색 0건 |
| F10 | `SignedApprovalBroker.createRequest()` tx 경로 삭제 | broker가 tx 타입 승인 요청을 생성하지 않음 확인 |
| F11 | `ApprovalStore.saveRejection()` + `listRejections()` 추가 | approval-store.ts에서 메서드 존재 확인 |
| F12 | `ApprovalStore.savePolicy()` 시그니처에 `description` 파라미터 추가 | approval-store.ts에서 시그니처 확인 |
| F13 | `ApprovalStore.listPolicyVersions()` 추가 | approval-store.ts에서 메서드 존재 확인 |
| F14 | JsonApprovalStore/SqliteApprovalStore에서 rejection CRUD 구현 | json/sqlite-approval-store.test.ts에서 saveRejection+listRejections round-trip 테스트 |
| F15 | JsonApprovalStore/SqliteApprovalStore에서 policy version 이력 구현 | json/sqlite-approval-store.test.ts에서 savePolicy 후 listPolicyVersions에 이력 존재 확인 |
| F16 | policy version diff 저장 | savePolicy 2회 호출 후 listPolicyVersions에서 diff 필드 non-null 확인 (2번째 버전) |
| F17 | `tx_approval` control message case 삭제 | control-handler.ts에서 `tx_approval` 검색 0건 |
| F18 | daemon index.ts에서 `ApprovalRequested` 이벤트 relay 제거 | index.ts에서 `ApprovalRequested` 검색 0건 |
| F19 | `policyRequest` tool: `reason` → `description` rename | tool-surface.ts에서 policyRequest의 파라미터가 `description` |
| F20 | `validatePolicy`에서 `REQUIRE_APPROVAL` 제거 | guarded-middleware.ts validatePolicy에서 `ALLOW`/`REJECT`만 허용 |
| F21 | factory에서 middleware 등록 시 `approvalBroker` 제거 (rejection recording은 daemon 담당) | guarded-wdk-factory.ts에서 `approvalBroker`/`rejectionRecorder` 검색 0건 |
| F22 | daemon tool surface에 `listRejections` + `listPolicyVersions` 조회 도구 추가. store에 rejection/policyVersion이 저장된 상태에서 도구 호출 시 기대 필드(accountIndex, chainId 필터 포함)로 반환 | tool-surface.test.ts에서 store에 데이터 삽입 후 `listRejections`/`listPolicyVersions` tool 호출 → 반환값 필드/필터 검증 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk typecheck: baseline 대비 `error TS` diagnostics 비증가 | grep -c 'error TS' 비교 |
| N2 | daemon build: baseline 대비 `error TS` diagnostics 비증가 | grep -c 'error TS' 비교 |
| N3 | guarded-wdk 전체 테스트 통과 | npm test 종료코드 0 |
| N4 | daemon 전체 테스트 통과 | npm test 종료코드 0 |
| N5 | packages/ src/에서 `AUTO`/`REQUIRE_APPROVAL`/`pending_approval`/`tx_approval`/`waitForApproval`/`ApprovalRequested`(middleware 내) 잔존 0건 | grep 결과 0건 (docs/ 제외) |
| N6 | guide 문서 업데이트 | Decision 설명 변경 확인 |
| N7 | 빈 DB/디렉터리에서 초기화 시 `rejection_history`/`policy_versions` 테이블/파일 생성 + 정상 동작 | sqlite-approval-store.test.ts / json-approval-store.test.ts에서 fresh store init 후 saveRejection + listPolicyVersions 동작 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | daemon에서 saveRejection 실패 | rejected 응답은 그대로 반환. 저장 실패는 로깅만. | tool-surface.test.ts에서 saveRejection throw해도 rejected 응답 반환 확인 |
| E2 | 빈 정책으로 tx 실행 | REJECT + reason "no policies for chain" | evaluate-policy.test.ts |
| E3 | 최초 정책 생성 (이전 버전 없음) | policy_versions에 version=1, diff=null, description 기록 | json/sqlite-approval-store.test.ts |
| E4 | 정책 2회 변경 후 diff 확인 | 2번째 버전의 diff가 1번째와의 차이를 구조화 JSON으로 포함 | json/sqlite-approval-store.test.ts |
| E5 | control-handler에서 policy_approval 시 description 전달 | savePolicy에 pending.content가 description으로 전달됨 | control-handler.test.ts |
| E6 | transfer REJECT 시 | daemon이 tx 정보를 기반으로 intentHash 생성 또는 randomUUID() 사용. 저장 대상에서 제외하지 않음. | tool-surface.test.ts에서 transfer REJECT 시 saveRejection 호출 확인 |
| E7 | `policyRequest(description)` → pending content → `policy_versions.description` round-trip | 동일한 description 문자열이 policyRequest tool → broker.createRequest(content) → pending request → policy_approval → savePolicy(description) → policy_versions.description까지 전달 | tool-surface.test.ts에서 policyRequest(description) 호출 시 broker.createRequest의 content 검증 + control-handler.test.ts에서 pending.content → savePolicy(description) 전달 검증 (2단계 연결) |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| Decision 2가지 단순화 | F1, F3, F4, F5, F6, F9, F10, F17, F18, F20 |
| REJECT 이력 저장 | F7, F8, F11, F14, F22, E1, E6 |
| 정책 버전 이력 도입 | F12, F13, F15, F16, F19, F22, E3, E4, E5, E7 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| Decision ALLOW/REJECT | F1, F20 |
| JournalStatus pending_approval 제거 | F2 |
| middleware approvalBroker 제거 | F6, F21 |
| daemon rejection recording | F7, F8, E1 |
| waitForApproval 삭제 | F4, F9 |
| tx_approval 폐기 | F17 |
| ApprovalRequested 폐기 | F5, F18 |
| savePolicy description 시그니처 | F12, E5 |
| rejection_history store | F11, F14 |
| policy_versions store | F13, F15, F16, E3, E4 |
| policyRequest reason→description | F19 |
| clean install | N7 |
