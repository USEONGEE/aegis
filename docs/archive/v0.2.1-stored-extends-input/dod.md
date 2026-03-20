# DoD (Definition of Done) - v0.2.1

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `StoredCron extends CronInput` — StoredCron이 CronInput의 4개 필드(sessionId, interval, prompt, chainId)를 상속하고 중복 선언하지 않음 | approval-store.ts에서 `interface StoredCron extends CronInput` 확인 |
| F2 | `StoredJournal extends JournalInput` — StoredJournal이 JournalInput의 5개 필드(intentHash, accountIndex, chainId, targetHash, status)를 상속하고 중복 선언하지 않음 | approval-store.ts에서 `interface StoredJournal extends JournalInput` 확인 |
| F3 | `StoredPolicy extends PolicyInput` — StoredPolicy가 PolicyInput의 2개 필드(policies, signature)를 상속하고, policiesJson/signatureJson 필드가 존재하지 않음 | approval-store.ts에서 `interface StoredPolicy extends PolicyInput` 확인 + policiesJson/signatureJson 필드 부재 확인 |
| F4 | JsonApprovalStore.loadPolicy가 policies와 signature 모두 파싱된 형태로 반환 | json-approval-store.test.ts의 policy round-trip 테스트: `expect(loaded!.policies).toEqual([...])` + `expect(loaded!.signature).toEqual({...})` |
| F5 | SqliteApprovalStore.loadPolicy가 policies와 signature 모두 파싱된 형태로 반환 | sqlite-approval-store.test.ts의 policy round-trip 테스트: `expect(loaded!.policies).toEqual([...])` + `expect(loaded!.signature).toEqual({...})` |
| F6 | guarded-wdk-factory.ts에서 JSON.parse(stored.policiesJson) 호출이 stored.policies 직접 접근으로 대체됨 | guarded-wdk-factory.ts에서 `policiesJson` 문자열 검색 0건 |
| F7 | daemon 소비자(wdk-host.ts, tool-surface.ts)에서 JSON.parse(stored.policiesJson) 호출이 stored.policies 직접 접근으로 대체됨 | wdk-host.ts + tool-surface.ts에서 `policiesJson` 문자열 검색 0건 |
| F8 | 타입 그래프에서 StoredCron → CronInput, StoredJournal → JournalInput, StoredPolicy → PolicyInput 엣지가 존재 | `npx tsx scripts/type-dep-graph/index.ts --include=guarded-wdk --json` 실행 후 JSON 출력에서 3개 extends 엣지 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk typecheck: master 039975f 대비 `error TS` diagnostics count 비증가 | `npm run typecheck --workspace=packages/guarded-wdk 2>&1 | grep -c 'error TS'` — baseline(039975f)과 변경 후 비교, 증가 없음 |
| N2 | daemon build: master 039975f 대비 `error TS` diagnostics count 비증가 | `npm run build --workspace=packages/daemon 2>&1 | grep -c 'error TS'` — baseline(039975f)과 변경 후 비교, 증가 없음 |
| N3 | guarded-wdk 전체 테스트 통과 | `cd packages/guarded-wdk && npm test` 종료코드 0 |
| N4 | daemon 전체 테스트 통과 | `cd packages/daemon && npm test` 종료코드 0 |
| N5 | packages/ 범위(src/, tests/)에서 policiesJson/signatureJson 잔존 0건 | `grep -r 'policiesJson\|signatureJson' packages/*/src packages/*/tests` 결과 0건 |
| N6 | 내부 저장 형식 변경 없음 — store-types.ts PolicyRow, SQLite CREATE TABLE 문, JSON 저장 키 모두 policies_json/signature_json 유지 | store-types.ts의 PolicyRow 필드, sqlite-approval-store.ts의 CREATE TABLE 문, json-approval-store.ts의 savePolicy에서 policies_json 키 사용 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 빈 정책 저장 후 로드 (policies: [], signature: {}) | loadPolicy가 `{ policies: [], signature: {}, ... }` 반환 | json/sqlite-approval-store.test.ts의 empty policy 테스트: `expect(loaded!.policies).toEqual([])` + `expect(loaded!.signature).toEqual({})` |
| E2 | SqliteApprovalStore.savePolicy 시 기존 정책 row의 JSON이 깨진 경우 | savePolicy 내부의 loadPolicy가 JSON.parse에서 실패 → savePolicy도 에러 throw (No Fallback). JsonApprovalStore는 savePolicy에서 loadPolicy를 거치지 않으므로 해당 없음. | 깨진 JSON row를 직접 삽입 후 savePolicy 호출 시 에러 발생 확인 (sqlite-approval-store.test.ts에 테스트 추가) |
| E3 | StoredCron/StoredJournal의 shape이 extends 전후 동일 | 기존 소비자 코드 변경 없이 TS non-regression 확인 | N1, N2 (baseline 대비 diagnostics 비증가)로 검증 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| StoredCron extends CronInput | F1, E3 |
| StoredJournal extends JournalInput | F2, E3 |
| StoredPolicy extends PolicyInput + 직렬화 캡슐화 | F3, F4, F5, F6, F7, E1, E2 |
| 타입 그래프에서 Stored → Input 의존 명시 | F8 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| interface extends 사용 | F1, F2, F3, F8 |
| store 내부 parse/stringify | F4, F5, N6 |
| PolicyInput 필드 이름 보존 | F3, F6, F7, N5 |
| store-types.ts PolicyRow 유지 | N6 |
