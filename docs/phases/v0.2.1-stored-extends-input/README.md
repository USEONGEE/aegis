# Stored extends Input 타입 통일 - v0.2.1

## 문제 정의

### 현상

guarded-wdk의 도메인 타입에서 Input/Stored 쌍이 3개 존재하는데, Stored가 Input의 필드를 그대로 복사하고 있다.

1. **CronInput / StoredCron**: `StoredCron`이 `CronInput`의 4개 필드(sessionId, interval, prompt, chainId)를 그대로 복제 + 5개 메타 필드 추가
2. **JournalInput / StoredJournal**: `StoredJournal`이 `JournalInput`의 5개 필드(intentHash, accountIndex, chainId, targetHash, status)를 그대로 복제 + 3개 메타 필드 추가
3. **PolicyInput / StoredPolicy**: `StoredPolicy`가 `PolicyInput`의 의미적 동일 데이터를 **직렬화된 형태**로 보유 (`policies: unknown[]` → `policiesJson: string`, `signature: Record<string, unknown>` → `signatureJson: string`). 소비자가 매번 `JSON.parse()` 해야 함.

### 원인

초기 설계 시 Input(쓰기)과 Stored(읽기) 타입을 독립적으로 정의했고, "Stored = Input + 메타데이터" 관계를 타입 수준에서 표현하지 않았다. PolicyInput/StoredPolicy의 경우 직렬화 형태가 store 인터페이스까지 노출된 것이 추가 원인.

### 영향

1. **필드 중복**: Input에 필드를 추가하면 Stored에도 수동으로 동일 필드를 추가해야 함. 누락 시 불일치 발생.
2. **직렬화 노출**: `StoredPolicy.policiesJson`을 소비하는 모든 곳에서 `JSON.parse()`를 호출. store 구현의 직렬화 전략이 도메인 인터페이스에 누출.
3. **타입 그래프 왜곡**: StoredCron/StoredPolicy가 Layer 0 leaf로 분류되지만, 의미적으로는 CronInput/PolicyInput에 의존. 그래프가 실제 관계를 반영하지 못함.

### 목표

1. `StoredCron extends CronInput` — 필드 중복 제거
2. `StoredJournal extends JournalInput` — 필드 중복 제거
3. `StoredPolicy extends PolicyInput` — 직렬화 필드(`policiesJson`/`signatureJson`) 제거, 파싱된 형태(`policies`/`signature`)로 통일. JSON.parse는 store 구현 내부로 이동.
4. 타입 그래프에서 Stored → Input 의존 관계가 명시적으로 표현됨

### 비목표 (Out of Scope)

- store 구현체 내부 저장 형식 변경 — SQLite의 `policies_json`/`signature_json` TEXT 컬럼, JSON 파일의 string 필드는 그대로 유지. store가 read 시 parse, write 시 stringify 하는 방식으로 변경
- ApprovalRequest / PendingApprovalRequest 관계 변경 — 이미 extends 관계
- HistoryEntry / StoredHistoryEntry 관계 변경 — StoredHistoryEntry는 store-types.ts 내부 타입(@internal)

### Scope 경계 명확화

| 항목 | In/Out | 이유 |
|------|--------|------|
| `StoredCron extends CronInput` | IN | 필드 4개 중복 제거 |
| `StoredJournal extends JournalInput` | IN | 필드 5개 중복 제거 |
| `StoredPolicy extends PolicyInput` | IN | 직렬화 노출 제거 + 필드 통일 |
| StoredPolicy 소비자의 `JSON.parse()` 제거 | IN | 위에 딸려옴 |
| store 구현체 내부에서 parse/stringify 이동 | IN | 위에 딸려옴 |
| StoredHistoryEntry / StoredJournalEntry 변경 | OUT | @internal 내부 타입, 외부 노출 없음 |
| guarded-wdk 소비자 수정 (guarded-wdk-factory.ts) | IN | StoredPolicy 필드명 변경에 딸려옴 |
| daemon 소비자 수정 (wdk-host.ts, tool-surface.ts) | IN | StoredPolicy 필드명 변경에 딸려옴 |
| daemon/guarded-wdk 테스트 수정 | IN | 위에 딸려옴 |
| app 패키지 수정 | OUT | policiesJson 소비 지점 없음 |

## 제약사항

- Breaking change 허용 (프로젝트 원칙)
- 내부 저장 형식(JSON 파일, SQLite 컬럼) 변경 없음 — `policies_json` TEXT 컬럼은 그대로 유지, public 인터페이스만 파싱된 형태로 변경. store 구현체가 read 시 parse, write 시 stringify. **clean install 불필요.**
