# 설계 - v0.4.1

## 변경 규모
**규모**: 일반 기능
**근거**: 3개 신규 체크 파일 + shared 유틸 1개 + registry 수정 + 4개 패키지에 걸친 ~70개 위반 수정. 런타임 동작 변경은 message-queue ProcessResult 도입뿐이며 scope 제한적.

---

## 문제 요약
empty catch, console.*, explicit any 위반이 정적 검증 없이 방치. CI 체크 3종을 AST 기반으로 추가하여 차단.

> 상세: [README.md](README.md) 참조

## 접근법

ts-morph `getDescendantsOfKind(SyntaxKind.XXX)`로 각 체크의 대상 AST 노드를 정확히 수집한 뒤, 부모 컨텍스트를 분석하여 위반 여부를 판별한다.

- **no-empty-catch**: `CatchClause` → `Block.getStatements().length === 0` (주석은 statement가 아니므로 자동 제외)
- **no-console**: `CallExpression` → expression이 `console.*` PropertyAccessExpression인지 확인
- **no-explicit-any**: `AnyKeyword` → 부모 노드 종류별로 컨텍스트 메시지 분류

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `getDescendantsOfKind()` | 기존 `restricted-usage.ts` 검증 패턴, SyntaxKind별 최적화, 정확한 시멘틱 | ts-morph 파싱 비용 (캐시로 완화) | ✅ |
| B: `forEachDescendant()` 콜백 | 한 번 순회로 여러 패턴 감지 가능 | CheckEntry 독립 실행 원칙 위반, 3로직 혼재 | ❌ |
| C: regex 라인 스캔 | 가장 빠름, 기존 체크 패턴 | **PRD 제약 위반** (AST only), empty catch 멀티라인 불안정, any 변수명 FP | ❌ |

**선택 이유**: A는 PRD 제약 충족 + 기존 검증 패턴 + CheckEntry 독립성 유지. no-empty-catch의 "주석만 있는 catch" 판별은 AST만 정확히 가능.

## 기술 결정

### 1. no-empty-catch

```
탐색: sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause)
판별: clause.getBlock().getStatements().length === 0
```

ts-morph `Block.getStatements()`는 실제 statement만 반환하고 주석은 제외. PRD의 "주석만 있는 catch 금지" 정책이 자동으로 구현됨.

**scope**: 전체 7개 패키지 (canonical, guarded-wdk, manifest, daemon, relay, app, protocol).

### 2. no-console

```
탐색: sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
판별: expr.getExpression() instanceof PropertyAccessExpression
      && expr.getExpression().getExpression().getText() === 'console'
```

`restricted-usage.ts`의 `method-call` rule과 동일 패턴. `console` 객체의 모든 메서드를 커버.

**scope**: 전체 7개 패키지.
**메시지**: `console.${methodName}() — use structured logger`

### 3. no-explicit-any

```
탐색: sourceFile.getDescendantsOfKind(SyntaxKind.AnyKeyword)
```

`AnyKeyword`는 타입 어노테이션의 `any`만 정확히 잡음. 변수명 `any`, 문자열 `"any"` 등 FP 없음.

**컨텍스트별 메시지**:

| 부모 노드 | 예시 | 메시지 |
|-----------|------|--------|
| AsExpression | `x as any` | `'as any' type assertion` |
| CatchClause variable | `catch (err: any)` | `catch parameter typed as 'any' — use 'unknown'` |
| Parameter | `fn(x: any)` | `parameter typed as 'any'` |
| VariableDeclaration | `const x: any` | `variable typed as 'any'` |
| TypeReference 내부 | `Record<string, any>` | `'any' in type expression` |
| 기타 | - | `explicit 'any' usage` |

**scope**: daemon, relay, app, manifest (guarded-wdk 제외 — 기존 `no-type-assertion` 커버).

### 4. ProcessResult 타입 (message-queue)

```typescript
interface ProcessResult {
  ok: boolean
  error?: string
}

// before
type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<void>

// after
type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<ProcessResult>
```

`_drain()` 변경: processor가 Result 반환 → empty catch 불필요. 예기치 못한 throw에 대비한 catch는 logger 로깅으로 대체.

**영향 범위**: `message-queue.ts` + `index.ts` (processor 콜백).

### 5. group 배치

| 체크 | group | 이유 |
|------|-------|------|
| `no-empty-catch` | `cross` | 전체 패키지 대상 공통 규칙 |
| `no-console` | `cross` | 전체 패키지 대상 공통 규칙 |
| `no-explicit-any` | `cross` | 4개 패키지 대상, cross가 적합 |

### 6. 파일 수집 전략

기존 `getSourceFiles()`는 `.ts`만 수집. `.tsx` 누락 문제.

**해결**: ts-morph `getProject(tsconfigPath).getSourceFiles()`를 사용. tsconfig의 `include`에 따라 `.tsx` 자동 수집. dead-exports와 동일 패턴. `getSourceFiles()` 수정은 기존 체크 영향으로 하지 않음.

공유 유틸 `shared/ast-source-files.ts` 추출:
```typescript
getAstSourceFiles(tsconfigPaths: string[]): SourceFile[]
// ts-morph Project 기반 + first-party 필터 (src/ prefix, node_modules/dist 제외)
```

---

## 범위 / 비범위

### 범위 (In Scope)
- CI 체크 3개 구현 (AST 기반)
- `shared/ast-source-files.ts` 공유 유틸 추출
- registry.ts에 3개 등록
- fixture 3개 작성
- 기존 위반 전수 수정 (0 violation PASS)
- message-queue ProcessResult 타입 도입

### 비범위 (Out of Scope)
- 기존 `getSourceFiles()` 수정
- 기존 15개 체크 수정
- pino 등 구조화 로깅 도입 (console 제거만)
- guarded-wdk의 explicit any (기존 체크 커버)

## 아키텍처 개요

```
scripts/check/
├── checks/cross/
│   ├── no-empty-catch.ts         ← 신규
│   ├── no-console.ts             ← 신규
│   └── no-explicit-any.ts        ← 신규
├── shared/
│   └── ast-source-files.ts       ← 신규: getAstSourceFiles()
├── __fixtures__/
│   ├── empty-catch-sample.ts     ← 신규
│   ├── console-usage-sample.ts   ← 신규
│   └── explicit-any-sample.ts    ← 신규
└── registry.ts                   ← 수정: 3개 체크 등록
```

위반 수정 대상 패키지:
- daemon: relay-client.ts, message-queue.ts, index.ts, admin-server.ts, tool-surface.ts 등
- relay: routes/auth.ts, routes/ws.ts, routes/push.ts 등
- app: RelayClient.ts, LoginScreen.tsx, ChatDetailScreen.tsx 등
- guarded-wdk: guarded-middleware.ts (empty catch 1곳)

## 위반 수정 가이드

### empty catch → 패턴별 수정

| 현재 패턴 | 수정 방향 |
|-----------|----------|
| `catch {}` (완전 비어있음) | `catch (err) { logger.debug({ err }, '...')  }` |
| `catch { // comment }` (주석만) | 동일 — 주석을 logger 호출로 대체 |
| message-queue `catch {}` | ProcessResult 도입으로 catch 불필요하게 만듦 |
| guarded-wdk polling catch | emitter를 통한 에러 전파 또는 `catch (err: unknown) { emitter.emit('PollingError', err) }` — 실질적 처리 필수 |

### console.* → 제거 또는 logger 대체

| 현재 패턴 | 수정 방향 |
|-----------|----------|
| daemon `console.log` (enrollment UI) | 기존 logger 인스턴스 사용 (`this._logger` 등) |
| daemon `console.error` (fatal) | `logger.fatal()` |
| app `console.warn/error` | 단순 제거 (RN은 별도 로깅 체계) |

### explicit any → 타입 정밀화

| 현재 패턴 | 수정 방향 |
|-----------|----------|
| `catch (err: any)` | `catch (err: unknown)` + 타입 가드 |
| `as any` (외부 라이브러리) | 적절한 타입으로 교체. 불가능한 경우 `as unknown as TargetType` 허용 (AnyKeyword가 아니므로 체크 범위 밖. 외부 라이브러리 타입 한계에 대한 예외로 간주) |
| `: any` (파라미터/변수) | 구체 타입으로 교체 |
| `Record<string, any>` | `Record<string, unknown>` 또는 구체 타입 |

## API/인터페이스 계약

### MessageProcessor 시그니처 변경 (daemon 내부)

```typescript
// before
type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<void>

// after
type MessageProcessor = (msg: QueuedMessage, signal: AbortSignal) => Promise<ProcessResult>
```

**변경 이유**: empty catch 제거를 위해 processor가 명시적 성공/실패를 반환해야 함.
**영향**: daemon 패키지 내부 계약. 외부 소비자 없음. 호출자는 `daemon/src/index.ts` 1곳.

## 테스트 전략

- **fixture 3개**: `__fixtures__/` 에 위반/비위반 패턴 모두 포함
- **positive test**: 위반 전수 수정 후 `npx tsx scripts/check/index.ts` → 전체 PASS
- **negative test**: 개별 체크 실행 `--check=cross/no-empty-catch` 등으로 동작 확인
- **regression**: fixture 파일은 `packages/*/src/` 밖이므로 체크 대상이 아님. 체크 로직 변경 시 fixture로 수동 검증

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| explicit any 55개 수정 범위 | 4개 패키지에 걸쳐 타입 변경. 오타입 리스크 | 패키지별 `tsc --noEmit -p packages/XXX/tsconfig.json` 직접 실행으로 검증 (기존 typescript-compile 체크는 비활성 상태) |
| ProcessResult 도입 | message-queue 런타임 변경 | scope 제한 (2파일). 호출자가 1곳뿐 |
| guarded-wdk polling catch | emitter 패턴 도입 필요 | guarded-middleware의 기존 emitter 인프라 활용 |
