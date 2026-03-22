# DoD (Definition of Done) - v0.4.1

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `no-empty-catch` 체크가 `scripts/check/checks/cross/no-empty-catch.ts`에 구현되어 있다 | 파일 존재 확인 + `npx tsx scripts/check/index.ts --check=cross/no-empty-catch` 실행 시 PASS |
| F2 | `no-console` 체크가 `scripts/check/checks/cross/no-console.ts`에 구현되어 있다 | 파일 존재 확인 + `npx tsx scripts/check/index.ts --check=cross/no-console` 실행 시 PASS |
| F3 | `no-explicit-any` 체크가 `scripts/check/checks/cross/no-explicit-any.ts`에 구현되어 있다 | 파일 존재 확인 + `npx tsx scripts/check/index.ts --check=cross/no-explicit-any` 실행 시 PASS |
| F4 | 3개 체크가 `scripts/check/registry.ts`에 group `cross`로 등록되어 있다 | registry.ts에서 3개 entry 확인 |
| F5 | 3개 체크 모두 ts-morph AST 기반으로 구현 (regex/텍스트 매칭 없음) | 코드에 `readFileSync` + regex 패턴 대신 `getDescendantsOfKind` 또는 ts-morph API 사용 확인 |
| F6 | `no-empty-catch`는 `CatchClause` → `Block.getStatements().length === 0`으로 판별한다 | 체크 소스 코드 확인 |
| F7 | `no-console`은 `CallExpression` → `console.*` PropertyAccessExpression으로 판별한다 | 체크 소스 코드 확인 |
| F8 | `no-explicit-any`는 `AnyKeyword` SyntaxKind로 판별하고 부모 컨텍스트별 메시지를 생성한다 | 체크 소스 코드 확인 + violation 메시지에 컨텍스트 포함 확인 |
| F9 | `shared/ast-source-files.ts`에 `getAstSourceFiles()` 공유 유틸이 구현되어 있다 | 파일 존재 확인 + 3개 체크 모두 이 유틸 사용 확인 |
| F10 | `no-empty-catch`, `no-console`은 전체 7개 패키지 src를 스캔한다 | 체크 소스 코드에서 대상 tsconfig 목록 확인 |
| F11 | `no-explicit-any`는 daemon, relay, app, manifest 4개 패키지만 스캔한다 (guarded-wdk 제외) | 체크 소스 코드에서 대상 tsconfig 목록 확인 |
| F12 | `.tsx` 파일도 스캔 대상에 포함된다 | app의 `LoginScreen.tsx` 등이 체크 대상에 포함되는지 확인 |
| F13 | fixture 3개가 `scripts/check/__fixtures__/`에 존재한다 (empty-catch-sample.ts, console-usage-sample.ts, explicit-any-sample.ts) | 파일 존재 확인 |
| F14 | 전체 CI 체크 실행 시 기존 체크 + 신규 3개 모두 PASS | `npx tsx scripts/check/index.ts` 실행 시 전체 PASS (exit code 0) |
| F15 | 3개 체크 모두 `tests/`, `dist/`, `node_modules/`, `__fixtures__/` 경로를 스캔에서 제외한다 | 제외 경로의 위반 파일이 violation에 포함되지 않는 것을 확인 (first-party filter) |

## 위반 수정 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| V1 | 모든 패키지 src에 empty catch (statement 0개인 catch block)가 0개 | `--check=cross/no-empty-catch` → 0 violations |
| V2 | 모든 패키지 src에 `console.*` 호출이 0개 | `--check=cross/no-console` → 0 violations |
| V3 | daemon/relay/app/manifest src에 explicit `any` (AnyKeyword) 사용이 0개 | `--check=cross/no-explicit-any` → 0 violations |
| V4 | `message-queue.ts`의 `MessageProcessor`가 `ProcessResult`를 반환한다 | 타입 시그니처 확인: `Promise<ProcessResult>` |
| V5 | `message-queue.ts`의 `_drain()` catch block에 `logger.*` 호출이 있다 (void/no-op/주석만 금지) | catch block 내 `logger.error` 또는 `logger.warn` 호출 확인 |
| V6 | `guarded-middleware.ts`의 polling catch에 `emitter.emit()` 호출이 있다 (void/no-op/주석만 금지) | catch block 내 `emitter.emit('PollingError', ...)` 호출 확인 |
| V7 | daemon src에 `console.*` 위반이 0개 | `--check=cross/no-console` → daemon 패키지 위반 0 |
| V8 | app src에 `console.*` 위반이 0개 | `--check=cross/no-console` → app 패키지 위반 0 |
| V9 | 모든 `catch (err: any)`가 `catch (err: unknown)`으로 변경되었다 | `--check=cross/no-explicit-any` → catch 관련 위반 0 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 모든 대상 패키지에서 TypeScript 컴파일 에러 0 | 패키지별 `tsc --noEmit -p packages/XXX/tsconfig.json` 실행 (daemon, relay, app, manifest, guarded-wdk) |
| N2 | 기존 체크에 regression 없음 | `npx tsx scripts/check/index.ts` 전체 실행 시 기존 체크 모두 PASS |
| N3 | 3개 신규 체크가 CheckResult/Violation 인터페이스를 준수한다 | 체크 반환값이 `{ name, passed, violations[] }` 형태 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | catch block에 주석만 있는 경우 (`catch { // ignore }`) | no-empty-catch가 위반으로 감지 | fixture의 comment-only catch가 violation으로 잡히는지 확인 |
| E2 | catch block에 statement + 주석이 있는 경우 (`catch (err) { log(err) // handle }`) | no-empty-catch가 위반으로 감지하지 않음 | fixture의 statement 있는 catch가 통과하는지 확인 |
| E3 | 문자열 리터럴 내의 `console.log` (`const s = "console.log()"`) | no-console이 위반으로 감지하지 않음 (AST상 CallExpression이 아님) | 문자열 내 console이 FP 없이 통과하는지 확인 |
| E4 | 주석 내의 `console.log` (`// console.log(debug)`) | no-console이 위반으로 감지하지 않음 (AST상 주석은 노드가 아님) | 주석 내 console이 FP 없이 통과하는지 확인 |
| E5 | 변수명 `any` (`const any = 1`) | no-explicit-any가 위반으로 감지하지 않음 (AnyKeyword가 아님) | 변수명 any가 FP 없이 통과하는지 확인 |
| E6 | `as unknown as TargetType` 패턴 | no-explicit-any가 위반으로 감지하지 않음 (AnyKeyword 없음) | as unknown as 패턴이 FP 없이 통과하는지 확인 |
| E7 | 파라미터 없는 catch (`catch { return null }`) | no-empty-catch가 return statement를 인식하여 통과 | ES2019 optional catch binding이 정상 처리되는지 확인 |
| E8 | `.tsx` 파일의 위반 | 3개 체크 모두 `.tsx` 파일을 정상 스캔 | app의 `LoginScreen.tsx` 등에서 위반이 감지되는지 확인 |
| E9 | `Record<string, any>` 같은 제네릭 내부 any | no-explicit-any가 위반으로 감지 | fixture에서 제네릭 내부 any가 잡히는지 확인 |
| E10 | `console['log']()` bracket notation | **비범위** — PropertyAccessExpression 기반 설계상 감지하지 않음. 현 코드베이스에 사용 없음 | no-console 소스 코드가 `PropertyAccessExpression`만 검사하고 `ElementAccessExpression`을 검사하지 않음을 확인 + fixture에 bracket notation 패턴 포함 시 violation 0건 확인 |
| E11 | `tests/` 디렉토리의 위반 코드 | 3개 체크 모두 스캔에서 제외 | tests 내 console/any 사용이 violation에 포함되지 않는 것을 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| no-empty-catch CI 체크 추가 | F1, F5, F6, F10, F12, F15 |
| no-console CI 체크 추가 | F2, F5, F7, F10, F12, F15 |
| no-explicit-any CI 체크 추가 | F3, F5, F8, F11, F12, F15 |
| AST 기반 구현 | F5 |
| 기존 위반 0 violation PASS | V1~V9, F14 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| getDescendantsOfKind 패턴 | F5, F6, F7, F8 |
| cross group 배치 | F4 |
| getAstSourceFiles 공유 유틸 | F9 |
| first-party filter (scope exclusion) | F15, E11 |
| ProcessResult 타입 | V4, V5 |
| 7개 패키지 scope (empty-catch, console) | F10 |
| 4개 패키지 scope (explicit-any) | F11 |
| .tsx 포함 | F12 |
| MessageProcessor 시그니처 변경 | V4 |
| emitter 기반 polling catch | V6 |
| bracket notation 비범위 | E10 |
