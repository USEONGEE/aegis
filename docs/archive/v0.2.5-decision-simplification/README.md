# Decision 단순화 + 정책 버전 이력 — v0.2.5

## 문제 정의

### 현상

1. **Decision이 3가지**: `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'`. `REQUIRE_APPROVAL`은 "REJECT인데 사람이 override할 수 있는 REJECT"에 불과. 정책 작성자가 "이건 승인 필요"를 미리 결정하는 구조인데, 그 판단은 정책 작성 시점이 아니라 실행 시점에 사람이 하면 됨.

2. **REJECT 사유 소실**: 정책 평가에서 REJECT되면 `EvaluationResult.reason`에 기술적 사유("no matching permission", "args mismatch")만 남음. 정책이 왜 이렇게 설정됐는지(의도)는 어디에도 기록되지 않음. AI가 REJECT를 받았을 때 "정책을 바꿔달라고 요청해야 하나, 다른 지갑을 써야 하나"를 판단할 근거가 없음.

3. **정책 버전 이력 없음**: `policyVersion`은 단조증가 정수로 존재하지만, 어떤 변경이 있었는지, 왜 바뀌었는지 기록이 없음. AI가 정책 변경을 요청할 때 "현재 정책이 왜 이런지"를 알 수 없음.

### 원인

- 초기 설계에서 `REQUIRE_APPROVAL`을 별도 decision으로 도입하면서 tx 승인과 정책 승인이 혼재됨
- 정책 의도/이력을 기록하는 메타데이터 레이어가 설계되지 않음
- AI 에이전트의 "다음 행동 결정"을 위한 정보 요구사항이 고려되지 않음

### 영향

1. middleware에 `REQUIRE_APPROVAL` 분기가 존재하여 승인 대기 로직이 복잡 (sendTransaction/transfer/signTransaction 각각에 approval 분기)
2. AI가 REJECT를 받아도 맥락 없이 재시도하거나 포기하는 수밖에 없음
3. 정책 변경 시 이전 정책과의 차이, 변경 사유를 추적할 수 없음

### 목표

1. **Decision을 2가지로 단순화**: `'ALLOW' | 'REJECT'`. `REQUIRE_APPROVAL` 제거.
   - ALLOW: 실행
   - REJECT: 거부. AI가 원하면 정책 변경을 요청(policyRequest). 사람이 승인하면 정책 개정.
2. **REJECT 이력 저장**: REJECT된 tx의 `{ intentHash, accountIndex, chainId, targetHash, reason, context, policyVersion, rejectedAt }`를 store에 기록. `policyVersion`으로 어떤 정책 버전에서 거부됐는지 추적 가능. AI가 거부 이력을 조회하여 패턴 파악.
3. **정책 버전 이력 도입**: 정책 변경 시 `{ accountIndex, chainId, version, description, diff, changedAt }`를 기록. `description`은 AI가 정책 변경 요청 시 필수로 작성 (기존 `reason` 파라미터를 `description`으로 rename). `diff`는 이전 버전과의 구조화 diff (JSON). 최초 생성: diff=null + description.

### 비목표 (Out of Scope)

- `EvaluationResult` 타입 자체 구조 변경 (decision 필드 값만 바뀜, 구조는 유지)
- Rule 타입에 reason/description 필드 추가 (정책 의도는 버전 이력으로 분리)
- daemon의 AI 도구(tool-surface) 로직 변경 — 승인 대기 로직 제거만 해당
- RN App UI 변경

### Scope 경계 명확화

| 항목 | In/Out | 이유 |
|------|--------|------|
| `Decision` 타입: 3가지 → 2가지 (`ALLOW`/`REJECT`) | IN | 핵심 변경 |
| middleware 승인 대기 로직 제거 (REQUIRE_APPROVAL 분기) | IN | Decision 단순화에 딸려옴 |
| `ApprovalStore`에 REJECT 이력 저장 메서드 추가 | IN | 목표 2 |
| `ApprovalStore`에 정책 버전 이력 메서드 추가 | IN | 목표 3 |
| `policyRequest` 도구의 `reason` → `description` rename | IN | 정책 버전 이력과 통일 |
| `SignedApprovalBroker` 승인 대기 로직 단순화 | IN | REQUIRE_APPROVAL 제거에 딸려옴 |
| Rule 타입 변경 | OUT | 정책 의도는 버전 이력으로 분리 |
| daemon tool-surface: 승인 대기 → 즉시 REJECT 반환으로 단순화 | IN | middleware 변경에 딸려옴 |
| `tx_approval` control message 폐기 | IN | REQUIRE_APPROVAL 제거에 딸려옴 |
| `pending_approval` JournalStatus 제거 | IN | 승인 대기 상태 불필요 |
| middleware `waitForApproval` / `ApprovalRequested` 이벤트 폐기 | IN | 승인 대기 로직 제거 |
| RN App 변경 | OUT | 승인 UI는 정책 변경 승인에만 사용 |

### 데이터 보존 전략

**REJECT 이력 (`rejection_history`)**:
```
{ intentHash, accountIndex, chainId, targetHash, reason, context, policyVersion, rejectedAt }
```

**정책 버전 이력 (`policy_versions`)**:
```
{ accountIndex, chainId, version, description, diff, changedAt }
```
- `description`: AI가 작성한 정책 변경 사유 (= 기존 policyRequest의 `reason`을 `description`으로 rename)
- `diff`: 이전 버전과의 구조화 diff (JSON). 변경된 Rule들의 before/after 스냅샷.
- 최초 생성: `diff = null`, `description = "초기 정책 생성: ..."`

**tx_approval 폐기**:
- `REQUIRE_APPROVAL` 제거에 따라 `tx_approval` control message 폐기
- `pending_approval` journal 상태 폐기 (JournalStatus에서 제거)
- middleware의 승인 대기 로직 (waitForApproval, ApprovalRequested 이벤트) 폐기

### 사용자 확정 결정사항

| 결정 | 내용 | 사유 |
|------|------|------|
| Decision 2가지 | `ALLOW` / `REJECT` | REQUIRE_APPROVAL은 "override 가능한 REJECT"일 뿐. 승인은 정책 레벨에서 처리. |
| REJECT 이력 저장 | `{ intentHash, accountIndex, chainId, targetHash, reason, context, policyVersion, rejectedAt }` | AI가 거부 패턴을 파악하여 정책 변경 요청 근거로 사용 |
| 정책 버전 이력 | `{ accountIndex, chainId, version, description, diff, changedAt }` | AI가 description 필수 작성. diff는 구조화 JSON. 최초 생성도 포함. |
| description 작성 주체 | AI | 이 시스템은 AI를 위한 CLI이므로 AI가 정책 변경 사유를 기록 |
| 정책 변경 diff | 구조화 diff (JSON) | 이전 버전과의 Rule 단위 before/after. 정확한 변경 추적. |
| policyRequest reason → description | rename | 동일한 값이 pending request content + 정책 버전 이력 description에 저장 |
| tx_approval / pending_approval | 폐기 | REQUIRE_APPROVAL 제거에 따라 tx 승인 경로 전체 제거 |

### v0.2.4 병행 가능성

v0.2.4 (WDK 외부 타입 직접 참조)와 **병행 가능**:
- v0.2.4는 `guarded-wdk-factory.ts`의 타입 선언 + `as any` 캐스트 제거. 정책 평가 로직 미변경.
- v0.2.5는 `guarded-middleware.ts`의 Decision/평가 로직 + store 메서드 추가.
- 수정 파일이 겹치지 않음 (factory.ts vs middleware.ts + store).
- 단, v0.2.5의 middleware 변경이 factory의 middleware 등록 코드에 영향줄 수 있으므로 v0.2.4 먼저 완료 후 v0.2.5 진행이 안전.

## 제약사항

- Breaking change 허용
- `REQUIRE_APPROVAL` 제거는 기존 정책 데이터와 호환 불가 — clean install 또는 마이그레이션 필요
- 정책 버전 이력은 새 테이블/파일로 추가 (기존 policies 저장 형식 변경 최소화)
