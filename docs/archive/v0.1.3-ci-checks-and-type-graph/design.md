# 설계 - v0.1.3

## 변경 규모
**규모**: 일반 기능
**근거**: 신규 스크립트 디렉토리 (scripts/check, scripts/type-dep-graph) + Claude 스킬 2개. 기존 패키지 코드는 체크 위반 해소를 위한 최소 수정만.

---

## 문제 요약
패키지 경계, 타입 안전, 아키텍처 규칙이 코드로 강제되지 않음.

> 상세: [README.md](README.md) 참조

## 접근법

HypurrQuant의 검증된 check 프레임워크 패턴을 WDK-APP에 맞게 재구현:
1. `scripts/check/` — registry + runner + 개별 체크 모듈
2. `scripts/type-dep-graph/` — ts-morph 기반 타입 의존성 그래프
3. `~/.claude/skills/` — CI 체크 생성 가이드 + 아키텍처 이해 가이드

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: ESLint 플러그인 | 에코시스템 통합 | 커스텀 규칙 작성 복잡, AST 패턴 제한 | ❌ |
| B: 커스텀 스크립트 (Phase 1: regex, Phase 2: ts-morph AST) | 빠른 구현 + 점진적 개선 | 자체 프레임워크 유지 필요 | ✅ |
| C: 단순 grep/regex | 빠름 | false positive 많음, 타입 정보 없음 | ❌ |

**선택 이유**: B. Phase 1은 regex로 빠르게 7개 체크 구현, type-dep-graph만 ts-morph 사용. Phase 2에서 체크도 ts-morph AST로 전환.

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| 체크 구현 | regex/텍스트 스캔 (Phase 1) | 빠른 구현, Phase 2에서 ts-morph AST로 전환 |
| 그래프 구현 | ts-morph | 타입 정보 + 선언 추적 (type-dep-graph용) |
| TS 실행기 | tsx (devDependency 추가) | TypeScript 직접 실행 |
| 실행 | npx tsx scripts/check/index.ts | CLI 진입점 |
| 출력 | 콘솔 (violations 목록) + exit code | CI 파이프라인 통합 |
| type-dep-graph 출력 | DOT + Mermaid + JSON | 시각화 + 프로그래밍 접근 |
| 스킬 위치 | ~/.claude/skills/ (글로벌) | 프로젝트 독립적 |

---

## 범위 / 비범위

**범위**:
- scripts/check/ 프레임워크 (registry, runner, shared utils)
- 8개 체크 모듈 구현
- scripts/type-dep-graph/ (ts-morph 기반, 4패키지)
- Claude 스킬 2개 (/ci, /arch)
- package.json에 `check`, `type-graph` 스크립트 추가

**비범위**:
- CI 파이프라인 설정 (GitHub Actions 등)
- app/canonical type-dep-graph

**범위 포함 (코드 수정)**:
- 기존 코드에서 체크 위반이 발견되면 이번 Phase에서 함께 수정 (as any 제거, require→import 등)
- 수정 목표: 7개 아키텍처 체크가 violation 0으로 PASS (typescript-compile은 Phase 2)

## 아키텍처 개요

### scripts/check/ 구조

```
scripts/check/
  index.ts              — CLI 진입점 (npx tsx scripts/check/index.ts [--check=name])
  registry.ts           — 체크 목록 + 메타데이터
  runner.ts             — 체크 실행 + 결과 집계
  shared/
    ts-project.ts       — ts-morph Project 캐시
    utils.ts            — 공통 유틸 (파일 목록, 패턴 매칭)
  checks/
    guarded-wdk/
      no-app-import.ts
      no-type-assertion.ts
    server/
      no-browser-globals.ts   # 1개 체크가 daemon+relay 양쪽 스캔
    cross/
      no-cross-package-import.ts
      no-require-imports.ts
      package-exports-boundary.ts
      dead-files.ts
      typescript-compile.ts
```

### 체크 모듈 인터페이스

```typescript
interface CheckResult {
  name: string
  passed: boolean
  violations: Violation[]
}

interface Violation {
  file: string
  line: number
  message: string
}

type CheckFn = () => CheckResult | Promise<CheckResult>
```

### type-dep-graph 구조

```
scripts/type-dep-graph/
  index.ts              — 메인 (HypurrQuant 패턴 포팅, WDK-APP 패키지 정의)
  verify.ts             — 그래프 검증 (순환 의존 탐지)
```

### Claude 스킬 구조

```
~/.claude/skills/
  wdk-ci-check/
    SKILL.md            — /ci 스킬: 체크 생성/실행 가이드
  wdk-type-architecture/
    SKILL.md            — /arch 스킬: 패키지별 타입 아키텍처 이해 가이드
```

## 테스트 전략

- 각 체크는 자체 검증: WDK-APP 코드에 대해 실행하여 expected violations 확인
- type-dep-graph: JSON 출력의 노드/엣지 수 검증
- 기존 242 테스트 유지 (체크 위반 수정 후에도 통과 확인)

## 리스크/오픈 이슈

| 리스크 | 영향 | 완화 |
|--------|------|------|
| ts-morph가 TS 마이그레이션된 코드를 파싱 못 할 수 있음 | type-dep-graph 실패 | tsconfig.json 설정 조정 |
| 체크가 너무 엄격하면 현재 코드에서 대량 violation | 무용 | 현재 코드 기준으로 체크 보정 |
| dead-files가 동적 import를 못 추적 | false positive | no-runtime-dynamic-import 체크로 보완 |
