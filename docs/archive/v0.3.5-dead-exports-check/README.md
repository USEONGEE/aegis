# Dead Exports CI 체크 포팅 - v0.3.5

## 문제 정의

### 현상
- WDK-APP의 `cross/dead-files` 체크는 **파일 단위**로만 미사용 코드를 탐지한다
- 파일은 import 그래프에 포함되지만 **파일 내부의 미사용 export**는 감지하지 못한다
- 예: `tool-surface.ts`의 `ToolResult` deprecated alias — 파일은 살아있지만 해당 export는 아무도 import하지 않음

### 원인
- `dead-files` 체크의 설계 범위가 파일 레벨 도달 가능성까지만 커버
- export 레벨 미사용 탐지에는 ts-morph의 `getExportedDeclarations()` + import 소비자 추적이 필요하나 구현되어 있지 않음

### 영향
- dead export가 누적되어 코드 부채 증가
- 리팩토링 시 "이 export를 지워도 되나?" 판단에 수동 확인 필요
- 새 개발자가 미사용 export를 참조하여 의도치 않은 의존 생성 가능

### 목표
- HypurrQuant에서 검증된 `dead-exports` 체크를 WDK-APP 체크 프레임워크에 포팅
- `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 시 미사용 export 탐지

### 스캔 대상 패키지
- `packages/guarded-wdk`
- `packages/daemon`
- `packages/relay`
- `packages/manifest`
- `packages/app`
- `packages/canonical`
- `packages/protocol`

### 비목표 (Out of Scope)
- 탐지된 dead export의 실제 제거 (별도 Phase)
- dead-files 체크 수정/개선
- HypurrQuant 원본 체크의 기능 확장 (포팅만)

## 제약사항
- WDK-APP 체크 프레임워크 인터페이스 준수: `CheckFn = () => CheckResult | Promise<CheckResult>`
- HypurrQuant의 `resolveCanonicalOrigin` 핵심 알고리즘은 수정하지 않을 것
- WDK-APP에 Next.js가 없으므로 Next.js convention file 면제 로직 삭제
- ts-morph는 루트 devDependency에 이미 존재. `shared/ts-project.ts` 캐시 유틸 재사용

## 참조
- 작업위임서: `docs/handover/daemon-dead-code-cleanup.md` (Part B)
- HypurrQuant 원본: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/checks/cross/dead-exports.ts`
- 권위 소스: `scripts/check/registry.ts`, `scripts/check/types.ts`, `scripts/check/shared/ts-project.ts`
