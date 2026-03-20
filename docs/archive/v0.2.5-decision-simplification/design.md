# 설계 - v0.2.5

## 변경 규모
**규모**: 운영 리스크
**근거**: Decision 타입 변경, JournalStatus 변경, control message 폐기, middleware 승인 대기 로직 전체 제거, 새 store 메서드/테이블 추가. 기존 데이터 호환 불가 (clean install).

---

## 문제 요약

Decision이 3가지(AUTO/REQUIRE_APPROVAL/REJECT)인데 REQUIRE_APPROVAL은 "override 가능한 REJECT"에 불과. 승인은 tx 레벨이 아니라 정책 레벨에서 처리하면 됨. REJECT 이력과 정책 버전 이력이 없어서 AI가 거부 사유와 정책 변경 맥락을 파악 못함.

> 상세: [README.md](README.md) 참조

## 접근법

3가지 변경을 동시에 수행:
1. **Decision 단순화**: `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'` → `'ALLOW' | 'REJECT'`
2. **REJECT 이력 저장**: 새 store 메서드 `saveRejection()` + `listRejections()`
3. **정책 버전 이력**: `savePolicy()` 시 자동으로 버전 이력 기록, `listPolicyVersions()` 조회

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Decision 2가지 + 이력 저장 | 구조 단순화 + AI 맥락 제공 | 대규모 변경 (middleware, daemon, store) | ✅ |
| B: REQUIRE_APPROVAL만 rename | 변경 최소 | 근본 문제 미해결 (3-state 유지) | ❌ |
| C: Decision 유지 + 이력만 추가 | 변경 범위 작음 | 불필요한 복잡성 유지 | ❌ |

## 기술 결정

| 결정 | 내용 | 근거 |
|------|------|------|
| Decision | `'ALLOW' \| 'REJECT'` | AUTO → ALLOW rename. REQUIRE_APPROVAL 제거. |
| REJECT 이력 | `rejection_history` 테이블/파일 | `{ intentHash, accountIndex, chainId, targetHash, reason, context, policyVersion, rejectedAt }` |
| 정책 버전 이력 | `policy_versions` 테이블/파일 | `{ accountIndex, chainId, version, description, diff, changedAt }` |
| diff 형식 | JSON 구조화 diff | `{ added: Policy[], removed: Policy[], modified: [{ before, after }] }` |
| policyRequest | `reason` → `description` rename | 정책 버전 이력 description과 통일 |
| savePolicy 시그니처 | `savePolicy(accountIndex, chainId, input, description)` | description 필수. control-handler에서 `pending.content`를 description으로 전달. |
| tx_approval | 폐기 | REQUIRE_APPROVAL 제거에 딸려옴 |
| pending_approval | JournalStatus에서 제거 | 승인 대기 상태 불필요 |
| 데이터 호환 | clean install | breaking change 허용, 마이그레이션 복잡도 회피 |

---

## 범위 / 비범위

- **범위**: guarded-middleware.ts, guarded-wdk-factory.ts, signed-approval-broker.ts, approval-store.ts, json/sqlite-approval-store.ts, index.ts, daemon/tool-surface.ts, daemon/control-handler.ts, daemon/execution-journal.ts, daemon/index.ts, store-types.ts, 관련 테스트, guide 문서
- **비범위**: Rule 타입, app 패키지, relay 패키지

## 아키텍처 개요

변경 전:
```
tx → evaluatePolicy → AUTO: 실행
                    → REQUIRE_APPROVAL: 승인 대기 → 사람 승인 → 실행
                    → REJECT: throw PolicyRejectionError
```

변경 후:
```
tx → evaluatePolicy → ALLOW: 실행
                    → REJECT: throw PolicyRejectionError + rejection_history 저장
                           → AI가 policyRequest(description) 요청 → 사람 승인 → 정책 개정
                           → 정책 개정 시 policy_versions에 diff+description 기록
```

## API/인터페이스 계약

| 변경 전 | 변경 후 |
|---------|---------|
| `Decision = 'AUTO' \| 'REQUIRE_APPROVAL' \| 'REJECT'` | `Decision = 'ALLOW' \| 'REJECT'` |
| `JournalStatus = 'received' \| 'pending_approval' \| 'settled' \| ...` | `JournalStatus = 'received' \| 'settled' \| 'signed' \| 'failed' \| 'rejected'` |
| `Rule.decision: Decision` (3가지) | `Rule.decision: Decision` (2가지) |
| middleware: REQUIRE_APPROVAL 분기 + waitForApproval | 삭제 |
| middleware: ApprovalRequested 이벤트 emit | 삭제 |
| `MiddlewareConfig.approvalBroker` | 삭제 — tx 승인 경로 폐기로 middleware에서 broker 불필요 |
| `SignedApprovalBroker.waitForApproval()` | 삭제 |
| `SignedApprovalBroker.createRequest()` for tx | 삭제 |
| `tx_approval` control message | 삭제 |
| `policyRequest` tool: `reason` param | `description` param |
| `ApprovalStore`: 없음 | `saveRejection(entry)`, `listRejections(opts)` 추가 |
| `ApprovalStore`: 없음 | `listPolicyVersions(accountIndex, chainId)` 추가 |
| `ApprovalStore.savePolicy(accountIndex, chainId, input)` | `savePolicy(accountIndex, chainId, input, description)` — description 필수 추가. 내부에서 자동으로 policy_versions에 diff+description 기록. |
| `ApprovalStoreWriter` (control-handler) | `savePolicy` 포함 (v0.2.2에서 이미 추가) |

## 데이터 모델/스키마

### rejection_history (신규)

```sql
CREATE TABLE rejection_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_hash TEXT NOT NULL,
  account_index INTEGER NOT NULL,
  chain_id INTEGER NOT NULL,
  target_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  context_json TEXT,
  policy_version INTEGER NOT NULL,
  rejected_at INTEGER NOT NULL
);
```

### policy_versions (신규)

```sql
CREATE TABLE policy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_index INTEGER NOT NULL,
  chain_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  description TEXT NOT NULL,
  diff_json TEXT,
  changed_at INTEGER NOT NULL
);
```

## 테스팅 전략

1. **evaluate-policy.test.ts**: `AUTO` → `ALLOW`, `REQUIRE_APPROVAL` 테스트 제거/변환
2. **integration.test.ts**: REQUIRE_APPROVAL 분기 테스트 제거, ALLOW/REJECT만
3. **factory.test.ts**: ALLOW/REJECT 기반으로 정리
4. **approval-broker.test.ts**: waitForApproval 관련 테스트 제거
5. **json/sqlite-approval-store.test.ts**: rejection_history + policy_versions CRUD 테스트 추가
6. **control-handler.test.ts**: tx_approval case 제거
7. **tool-surface.test.ts**: pending_approval 분기 제거, REJECT 이력 저장 테스트
8. **execution-journal.test.ts**: pending_approval 상태 제거 반영

## 실패/에러 처리

- REJECT 시 middleware는 `PolicyRejectionError`만 throw. rejection 이력 저장은 **daemon tool-surface**에서 담당 — `PolicyRejectionError`를 catch한 시점에 이미 정확한 `intentHash`(journal과 동일 키)를 보유하므로 상관관계 보장.
- `store.saveRejection()` 실패 시: catch하여 로깅만. `PolicyRejectionError` 결과는 그대로 반환.
- direct `@wdk-app/guarded-wdk` 사용 시 rejection 이력은 저장되지 않음 — daemon 경유가 전제.

## 가정/제약

- clean install 필수 (rejection_history, policy_versions 신규 테이블)
- v0.2.4 (WDK 타입 안전성) 완료 후 진행 — factory.ts 변경 충돌 방지

## 데이터 흐름

N/A: 외부 시스템 연동 없음. store 내부 CRUD만.

## 롤아웃/롤백 계획

- **롤아웃**: clean install. 기존 데이터 파기.
- **롤백**: `git revert`. clean install 환경이므로 데이터 마이그레이션 불필요.

## 관측성

N/A: 로컬 CLI 도구. 별도 메트릭/알람 없음.

## 보안/권한

N/A: 기존 보안 모델(Unified SignedApproval) 변경 없음. policy 승인은 기존대로 서명 필요.

## 성능/스케일

N/A: rejection_history/policy_versions는 로컬 SQLite. 레코드 수가 적어 성능 이슈 없음.

---

## Step-by-step 구현 계획

### Step 1: 타입 변경 (approval-store.ts, guarded-middleware.ts)

- `Decision`: `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'` → `'ALLOW' | 'REJECT'`
- `JournalStatus`: `'pending_approval'` 제거
- `ApprovalStore`에 `saveRejection()`, `listRejections()`, `listPolicyVersions()` 추상 메서드 추가
- `RejectionEntry`, `PolicyVersionEntry` 인터페이스 추가
- `store-types.ts`에 `RejectionRow`, `PolicyVersionRow` 추가
- `validatePolicy` 검증에서 `REQUIRE_APPROVAL` 제거

### Step 2: middleware 단순화 (guarded-middleware.ts)

- sendTransaction/transfer/signTransaction에서 REQUIRE_APPROVAL 분기 전체 제거
- `waitForApproval`, `approvalBroker.createRequest(tx)` 호출 제거
- `ApprovalRequested` 이벤트 emit 제거
- ALLOW: 실행, REJECT: throw PolicyRejectionError (단순 2분기). rejection 이력 저장은 daemon tool-surface에서 담당.

### Step 3: SignedApprovalBroker 정리

- `waitForApproval()` 메서드 삭제
- `createRequest()` tx 타입 경로 삭제 (policy/wallet 경로는 유지)
- 관련 pending approval 로직 정리

### Step 4: Store 구현 (json/sqlite-approval-store.ts)

- `saveRejection()`, `listRejections()` 구현
- `savePolicy()` 수정: 저장 시 자동으로 policy_versions에 이력 기록 (diff 계산 포함)
- `listPolicyVersions()` 구현
- SQLite: rejection_history, policy_versions 테이블 CREATE
- JSON: rejection-history.json, policy-versions.json 파일

### Step 5: Daemon 변경

- tool-surface.ts: sendTransaction/signTransaction/transfer에서 approval 대기 로직 제거 (rejection 저장은 middleware에서 처리됨)
- control-handler.ts: `tx_approval` case 삭제
- execution-journal.ts: `pending_approval` 문서/flow 정리
- index.ts: `ApprovalRequested` 이벤트 relay 제거
- policyRequest tool: `reason` → `description` rename

### Step 6: Export 정리 + Guide

- index.ts: `Decision` export 유지 (값만 변경)
- guide/README.md: Decision 설명 업데이트, REQUIRE_APPROVAL 제거

### Step 7: 테스트

- 전체 테스트 수정 (위 테스팅 전략 참조)
- rejection_history CRUD 테스트 추가
- policy_versions CRUD 테스트 추가
- ALLOW/REJECT 2-state 기반 통합 테스트

---

## 위험 평가

| 위험 | 심각도 | 완화 |
|------|--------|------|
| REQUIRE_APPROVAL 제거로 기존 정책 호환 불가 | High | clean install. 프로젝트 원칙상 허용. |
| middleware 대규모 변경 | Medium | 2-state로 단순화되므로 코드 줄어듦. 테스트로 커버. |
| broker waitForApproval 삭제 | Medium | tx 승인 경로 폐기. policy/wallet 승인은 유지. |
| diff 계산 복잡도 | Low | JSON deep diff. Policy[]는 작은 배열이므로 O(n²) 허용. |

## 변경 대상 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `guarded-wdk/src/approval-store.ts` | Decision 변경, JournalStatus 변경, RejectionEntry/PolicyVersionEntry 추가, 추상 메서드 추가 |
| `guarded-wdk/src/guarded-middleware.ts` | Decision 변경, REQUIRE_APPROVAL 분기 제거, validatePolicy 변경 |
| `guarded-wdk/src/guarded-wdk-factory.ts` | middleware 등록에서 approvalBroker 제거 |
| `guarded-wdk/src/signed-approval-broker.ts` | waitForApproval 삭제, createRequest tx 경로 삭제 |
| `guarded-wdk/src/json-approval-store.ts` | rejection/policyVersion CRUD 구현 |
| `guarded-wdk/src/sqlite-approval-store.ts` | rejection/policyVersion CRUD 구현, 테이블 생성 |
| `guarded-wdk/src/store-types.ts` | RejectionRow, PolicyVersionRow 추가 |
| `guarded-wdk/src/index.ts` | export 정리 |
| `guarded-wdk/docs/guide/README.md` | Decision 설명 변경 |
| `daemon/src/tool-surface.ts` | approval 대기 제거, rejection 저장, policyRequest rename |
| `daemon/src/control-handler.ts` | tx_approval case 삭제 |
| `daemon/src/execution-journal.ts` | pending_approval 정리 |
| `daemon/src/index.ts` | ApprovalRequested relay 제거 |
| 테스트 8개 파일 | 전체 수정 |
