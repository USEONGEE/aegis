# 작업 티켓 - v0.4.1

## 전체 현황

| # | Step | 난이도 | 롤백 | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|------|--------|
| 01 | CI Check Infrastructure | 🟠 | ✅ | ✅ | ⏳ | - |
| 02 | Fix Empty Catch | 🟡 | ✅ | ✅ | ⏳ | - |
| 03 | Fix Console | 🟡 | ✅ | ✅ | ⏳ | - |
| 04 | Fix Explicit Any — daemon | 🔴 | ✅ | ✅ | ⏳ | - |
| 05 | Fix Explicit Any — relay | 🔴 | ✅ | ✅ | ⏳ | - |
| 06 | Fix Explicit Any — app + 최종 검증 (manifest=0건, 검증only) | 🟠 | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 (infrastructure) → 02, 03, 04, 05 (병렬 가능)
                     → 06 (04, 05 완료 후)
```

Step 01이 foundation. Step 02~05는 서로 독립적으로 병렬 진행 가능. Step 06은 모든 수정 완료 후 최종 통합 검증.

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| no-empty-catch CI 체크 추가 | Step 01 | ✅ |
| no-console CI 체크 추가 | Step 01 | ✅ |
| no-explicit-any CI 체크 추가 | Step 01 | ✅ |
| AST 기반 구현 | Step 01 | ✅ |
| 기존 위반 0 violation PASS | Step 02~06 | ✅ |

### DoD 항목 → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 no-empty-catch 구현 | Step 01 | ✅ |
| F2 no-console 구현 | Step 01 | ✅ |
| F3 no-explicit-any 구현 | Step 01 | ✅ |
| F4 registry cross 등록 | Step 01 | ✅ |
| F5 AST 기반 (regex 없음) | Step 01 | ✅ |
| F6 CatchClause 판별 | Step 01 | ✅ |
| F7 CallExpression 판별 | Step 01 | ✅ |
| F8 AnyKeyword 판별 + 컨텍스트 메시지 | Step 01 | ✅ |
| F9 getAstSourceFiles 공유 유틸 | Step 01 | ✅ |
| F10 7개 패키지 scope | Step 01 | ✅ |
| F11 4개 패키지 scope (explicit-any) | Step 01 | ✅ |
| F12 .tsx 포함 | Step 01 | ✅ |
| F13 fixture 3개 | Step 01 | ✅ |
| F14 전체 체크 PASS | Step 06 | ✅ |
| F15 scope exclusion | Step 01 | ✅ |
| V1 empty catch 0 | Step 02 | ✅ |
| V2 console.* 0 | Step 03 | ✅ |
| V3 explicit any 0 | Step 04, 05, 06 | ✅ |
| V4 ProcessResult 반환 | Step 02 | ✅ |
| V5 _drain() catch logger | Step 02 | ✅ |
| V6 polling catch emitter | Step 02 | ✅ |
| V7 daemon console 0 | Step 03 | ✅ |
| V8 app console 0 | Step 03 | ✅ |
| V9 catch (err: any) → unknown | Step 04, 05, 06 | ✅ |
| N1 tsc --noEmit 통과 | Step 04, 05, 06 | ✅ |
| N2 기존 체크 regression 없음 | Step 06 | ✅ |
| N3 CheckResult/Violation 준수 | Step 01 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| getDescendantsOfKind 패턴 | Step 01 | ✅ |
| cross group 배치 | Step 01 | ✅ |
| getAstSourceFiles 공유 유틸 | Step 01 | ✅ |
| first-party filter | Step 01 | ✅ |
| ProcessResult 타입 | Step 02 | ✅ |
| 7개 패키지 scope | Step 01 | ✅ |
| 4개 패키지 scope | Step 01 | ✅ |
| .tsx 포함 | Step 01 | ✅ |
| MessageProcessor 시그니처 변경 | Step 02 | ✅ |
| emitter 기반 polling catch | Step 02 | ✅ |
| bracket notation 비범위 | Step 01 | ✅ |

## Step 상세
- [Step 01: CI Check Infrastructure](step-01-check-infrastructure.md)
- [Step 02: Fix Empty Catch](step-02-fix-empty-catch.md)
- [Step 03: Fix Console](step-03-fix-console.md)
- [Step 04: Fix Explicit Any — daemon](step-04-fix-any-daemon.md)
- [Step 05: Fix Explicit Any — relay](step-05-fix-any-relay.md)
- [Step 06: Fix Explicit Any — app + 최종 검증](step-06-fix-any-app-final.md)
