# Strict CI Checks - v0.4.1

## 문제 정의

### 현상
- 코드베이스에 에러를 조용히 삼키는 empty catch 블록이 **9곳** 존재 (daemon 6, guarded-wdk 1, app 1, relay 1)
- `console.*` 호출이 src 코드에 **약 19건** 존재 (daemon 11, app 8). relay는 pino 구조화 로깅으로 전환 완료되었으나 daemon/app은 미전환. log, error, warn 모두 포함
- `as any`, `: any`, `catch (err: any)` 등 명시적 any 사용이 guarded-wdk 외 패키지에서 **15개 이상** 존재. 기존 `no-type-assertion` 체크는 guarded-wdk만 커버

### 원인
- empty catch: "No Fallback" 원칙이 선언되어 있으나 정적 검증 수단 부재. 개발 시 convenience catch가 남아 있음
- console: 구조화 로깅 전환이 relay에만 적용됨. daemon/app에 대한 강제 규칙 부재
- explicit any: `no-type-assertion` 체크가 guarded-wdk scope + `as any` 패턴만 감지. daemon/relay의 `: any` 파라미터, `catch (err: any)` 등은 검증 범위 밖

### 영향
- **empty catch**: 에러가 사라져 디버깅 사각지대 발생. 특히 `message-queue.ts:96`에서 메시지 프로세서 에러가 완전히 소실되면 운영 중 장애 원인 추적 불가
- **console**: 로그 레벨/구조 없이 stdout에 섞여 로그 수집/분석 불가. 프로덕션에서 성능 이슈 유발 가능
- **explicit any**: 타입 시스템 구멍으로 런타임 에러 가능성 증가. guarded-wdk의 엄격한 타입 안전이 daemon/relay 경계에서 무력화

### 목표
- `no-empty-catch` CI 체크 추가: 모든 패키지에서 empty catch 블록 (주석만 있는 catch 포함) 감지
- `no-console` CI 체크 추가: 모든 패키지 src 코드에서 `console.*` 호출 전체 감지 (log, error, warn, info, debug, trace 모두 포함)
- `no-explicit-any` CI 체크 추가: daemon/relay/app/manifest에서 `: any`, `as any`, `catch (err: any)` 등 모든 명시적 any 사용 감지
- 3개 체크 모두 AST 기반으로 구현 (프레임워크 원칙 준수)
- 기존 위반을 모두 수정하여 0 violation 상태로 체크 통과

### 비목표 (Out of Scope)
- guarded-wdk의 `no-type-assertion` 체크 수정/병합 (기존 체크는 그대로 유지)
- 구조화 로깅 프레임워크(pino 등) 도입 (console 제거만 수행, 로깅 대체는 별도 Phase)
- app 패키지의 React Native 특수 패턴 예외 처리

### empty catch 허용 대체 패턴

**원칙**: empty catch / 주석만 있는 catch는 금지. 에러를 삼키려면 반드시 명시적 처리가 필요.

| 패턴 | 허용 여부 | 설명 |
|------|----------|------|
| `catch {}` | **금지** | silent swallow |
| `catch { // ignore }` | **금지** | 주석은 코드가 아님 |
| `catch (err) { logger.error(err) }` | **허용** | 로깅 후 continue |
| `catch (err) { throw err }` | **허용** | 예외 전파 |
| `catch (err) { return Result.fail(err) }` | **허용 (권장)** | 명시적 성공/실패 값 반환 |

**message-queue.ts 같은 "의도적 위임" 패턴**: processor가 명시적 성공/실패 값을 반환하도록 변경하여 예외가 catch에 도달하지 않게 한다. catch에 도달하는 경우는 예상치 못한 에러이므로 반드시 로깅한다. 구체적인 Result 타입 설계는 design.md에서 확정.

## 적용 범위

### 포함 경로 (In Scope)

| 체크 | 대상 패키지 | 경로 패턴 |
|------|------------|----------|
| `no-empty-catch` | 전체 | `packages/*/src/**/*.{ts,tsx}` |
| `no-console` | 전체 | `packages/*/src/**/*.{ts,tsx}` |
| `no-explicit-any` | daemon, relay, app, manifest | `packages/{daemon,relay,app,manifest}/src/**/*.{ts,tsx}` |

### 제외 경로 (Out of Scope)

| 경로 | 이유 |
|------|------|
| `packages/*/tests/**` | 테스트 코드는 편의상 any/console 허용 |
| `packages/*/dist/**` | 빌드 산출물 |
| `scripts/**` | CI 체크 자체 코드 |
| `packages/canonical/**` | 외부 타입 정의 패키지 |
| `packages/protocol/**` | 프로토콜 타입 정의 패키지 |
| `packages/guarded-wdk/**` (no-explicit-any만) | 기존 `no-type-assertion` 체크가 이미 커버 |

## 제약사항
- 모든 체크는 ts-morph AST 기반 구현 (grep/regex 텍스트 매칭 금지)
- 기존 `scripts/check/` 프레임워크 구조 준수 (CheckResult/Violation 인터페이스)
- 기존 15개 체크에 영향 없이 추가
- 체크 추가와 기존 위반 수정을 동시에 진행하여 PASS 상태로 머지
