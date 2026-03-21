# DoD (Definition of Done) - v0.3.5

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `scripts/check/checks/cross/dead-exports.ts` 파일이 존재하고 export하는 함수가 `CheckResult \| Promise<CheckResult>`를 반환한다 | `grep -n 'CheckResult' scripts/check/checks/cross/dead-exports.ts` |
| F2 | `scripts/check/registry.ts`에 `name: 'cross/dead-exports'`, `group: 'cross'` 엔트리가 존재한다 | `grep "cross/dead-exports" scripts/check/registry.ts` |
| F3 | `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 시 uncaught exception이나 hang 없이 종료된다. violations이 1건 이상 출력된다 (F4의 IntentErrorResult 포함) | CLI 실행 → 정상 종료 확인 + violations 출력 확인 |
| F4 | daemon의 미사용 export가 violations에 포함된다: `IntentErrorResult` (`packages/daemon/src/tool-surface.ts:30`) | 실행 결과에서 `tool-surface.ts` + `IntentErrorResult` 문자열 확인 |
| F5 | barrel re-export를 통한 import가 consumed로 마킹된다: `SqliteApprovalStore`는 `guarded-wdk/src/index.ts`에서 re-export되고 `daemon/src/wdk-host.ts:5`에서 import됨 → dead가 아니어야 함 | 실행 결과 violations에 `sqlite-approval-store.ts` + `SqliteApprovalStore`가 **없는지** 확인 |
| F6 | `import type`을 통한 소비가 마킹된다: `RelayEnvelope`는 `protocol/src/relay.ts`에서 export되고 `relay/src/routes/ws.ts:9`에서 `import type`으로 import됨 → dead가 아니어야 함 | 실행 결과 violations에 `relay.ts` + `RelayEnvelope`가 **없는지** 확인 |
| F7 | `SCAN_TARGETS`가 정확히 7개 패키지의 tsconfig를 포함하고 `SRC_PREFIXES`가 해당 패키지의 `src/` 루트로 파생된다 | 코드에서 `SCAN_TARGETS` 배열이 `guarded-wdk`, `daemon`, `relay`, `manifest`, `app`, `canonical`, `protocol` 7개를 포함하는지 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 기존 체크가 모두 runtime exception 없이 완료된다 (회귀 없음) | `npx tsx scripts/check/index.ts` 전체 실행 — dead-exports 외 모든 체크가 uncaught exception 없이 결과를 반환하는지 확인 |
| N2 | `shared/utils.ts`의 `PACKAGES` 상수가 수정되지 않았다 | 파일 내용에서 `PACKAGES = ['canonical', 'guarded-wdk', 'manifest', 'daemon', 'relay', 'app']` 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `packages/app/App.tsx`가 export를 포함하지만 `src/` 외부에 있음 | `isFirstPartyCode`가 `src/` prefix에 매칭되지 않아 scan universe에 포함되지 않음 | violations에 `App.tsx`가 없는지 확인 + `isFirstPartyCode` 함수 코드에서 `SRC_PREFIXES.some(prefix => filePath.startsWith(prefix))` 패턴 확인 |
| E2 | protocol 파일이 daemon/relay ts-morph 프로젝트에서 중복 로드될 때 | 절대경로 기준 dedup으로 같은 export가 2번 등록되지 않음 | 코드에서 universe를 `Map<string, SourceFile>`로 관리하고 `!universe.has(fp)` 가드가 있는지 확인 |
| E3 | `import * as NS from './module'` (namespace import) | 대상 모듈의 모든 export를 consumed로 마킹 (HypurrQuant 원본 동작 유지) | 코드에서 `getNamespaceImport()` 분기 존재 + 모든 export를 consumedSet에 추가하는 로직 확인 |
