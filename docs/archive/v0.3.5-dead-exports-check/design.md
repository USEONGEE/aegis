# 설계 - v0.3.5

## 변경 규모
**규모**: 일반 기능
**근거**: 새 모듈/파일 추가 (dead-exports.ts) + registry 등록

---

## 문제 요약
`dead-files` 체크는 파일 도달 가능성만 커버. 파일 내부의 미사용 export는 사각지대.

> 상세: [README.md](README.md) 참조

## 접근법
HypurrQuant의 `dead-exports.ts` (346줄)를 WDK-APP 체크 프레임워크(`CheckFn`/`CheckResult`)에 맞게 포팅.

핵심 알고리즘 4단계는 **그대로** 유지:
1. 모든 first-party 소스 파일 수집
2. `getExportedDeclarations()`로 export 수집 → canonical origin 해소
3. `ImportDeclaration` 스캔 → `resolveCanonicalOrigin()`으로 소비자 마킹
4. 마킹되지 않은 export = dead export

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: HypurrQuant 포팅 | 검증 완료된 알고리즘, barrel re-export 해소 | 346줄 중 불필요 코드 정리 필요 | ✅ |
| B: 새로 구현 | WDK-APP 최적화 가능 | 핵심 알고리즘 재구현 비용, barrel 해소 누락 위험 | ❌ |
| C: ESLint no-unused-exports 규칙 | 도구 생태계 활용 | 모노레포 cross-package 해소 어려움, 체크 프레임워크와 별도 실행 | ❌ |

**선택 이유**: A. resolveCanonicalOrigin의 barrel chain 해소 로직은 검증 비용이 높으므로 재사용이 합리적.

## 범위 / 비범위
- **범위(In Scope)**:
  - `scripts/check/checks/cross/dead-exports.ts` 신규 생성
  - `scripts/check/registry.ts` 에 체크 등록
- **비범위(Out of Scope)**:
  - `shared/utils.ts`의 `PACKAGES` 상수 수정 (기존 체크 영향 방지)
  - 탐지된 dead export의 실제 제거
  - 기존 체크 수정

## 기술 결정

### HypurrQuant → WDK-APP 매핑

| HypurrQuant | WDK-APP | 비고 |
|-------------|---------|------|
| `CheckModule` + `run(ctx)` | `CheckFn = () => CheckResult \| Promise<CheckResult>` | 인터페이스 변환 |
| `ctx.getProject(tsconfig)` | `getProject(tsconfig)` from `shared/ts-project.ts` | 캐시 유틸 재사용 |
| `APPS_WEB`, `APPS_SERVER`, `PACKAGES_CORE`, `PACKAGES_REACT` | 7개 패키지 tsconfig 경로 직접 정의 | 체크 내부에서 관리 |
| `shouldExcludeFile()` | 삭제 | WDK-APP에 해당 개념 없음 |
| `hasCiException()` | 삭제 | WDK-APP에 ci-exception 패턴 없음 |
| `toRelative()` | `path.relative(MONOREPO_ROOT, filepath)` | utils.ts의 MONOREPO_ROOT 재사용 |
| `buildResult()`, `measure()` | 직접 `{ name, passed, violations }` 반환 | WDK-APP CheckResult는 단순 |
| Next.js convention file 면제 | **전체 삭제** | WDK-APP에 Next.js 없음 |

### 스캔 대상 패키지 (7개)
체크 내부에서 tsconfig 경로를 직접 정의. `shared/utils.ts`의 `PACKAGES` 상수는 수정하지 않음 (기존 체크 영향 방지).

```typescript
const SCAN_TARGETS = [
  'packages/guarded-wdk/tsconfig.json',
  'packages/daemon/tsconfig.json',
  'packages/relay/tsconfig.json',
  'packages/manifest/tsconfig.json',
  'packages/app/tsconfig.json',
  'packages/canonical/tsconfig.json',
  'packages/protocol/tsconfig.json',
]
```

### isFirstPartyCode 판별
ts-morph `Project.getSourceFiles()`는 tsconfig 설정에 따라 tests, 설정 파일, 타 패키지 파일까지 포함할 수 있음. HypurrQuant 원본과 동일하게 **명시적 source-root prefix 기반 필터링** 적용:

```typescript
const SRC_PREFIXES = SCAN_TARGETS.map(t =>
  path.join(MONOREPO_ROOT, path.dirname(t), 'src') + path.sep
)

function isFirstPartyCode(filePath: string): boolean {
  if (filePath.includes('node_modules')) return false
  if (filePath.endsWith('.d.ts')) return false
  return SRC_PREFIXES.some(prefix => filePath.startsWith(prefix))
}
```

**제외 대상**: tests/, dist/, 설정 파일(jest.config.js 등), App.tsx(src/ 외 루트 파일), 타 패키지 파일(tsconfig references 경유)

### import type 처리
- `import type { X }` → 소비자로 **마킹함** (HypurrQuant 원본 동작 유지)
- 근거: 타입이 export되고 다른 파일에서 import type으로 사용 중이면 "살아있는" export

### barrel re-export 처리
- `resolveCanonicalOrigin()` 함수를 **그대로** 포팅
- barrel(index.ts)을 통한 re-export는 소비자가 아닌 "중계"로 처리
- 최종 canonical origin의 export만 live/dead 판정 대상

## 아키텍처 개요

```
scripts/check/
├── checks/cross/
│   ├── dead-files.ts          ← 기존: 파일 레벨 도달 가능성
│   └── dead-exports.ts        ← 신규: export 레벨 미사용 탐지
├── shared/
│   ├── ts-project.ts          ← 재사용: getProject() 캐시
│   └── utils.ts               ← 재사용: MONOREPO_ROOT
├── registry.ts                ← 수정: dead-exports 등록
└── types.ts                   ← 변경 없음
```

dead-exports.ts 내부 구조:
1. `SCAN_TARGETS` + `SRC_PREFIXES` — 스캔 범위 정의
2. `isFirstPartyCode()` — source-root prefix 필터
3. `resolveCanonicalOrigin()` — barrel chain 해소 (HypurrQuant 원본 유지)
4. `deadExportsCheck()` — CheckFn 구현 (4단계 알고리즘)

## 테스트 전략
- `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행으로 동작 검증
- daemon의 `ToolResult` deprecated alias가 dead export로 탐지되는지 확인
- false positive 없는지 결과 목시 검토

## 리스크/오픈 이슈
- N/A: 포팅 대상의 핵심 알고리즘이 HypurrQuant에서 검증 완료. WDK-APP 특화 리스크는 isFirstPartyCode 필터로 해소.
