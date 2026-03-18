# CI 체크 + Type Graph + 아키텍처 스킬 - v0.1.3

## 문제 정의

### 현상
- 6개 패키지 간 의존성 규칙이 코드로 강제되지 않음 (문서에만 존재)
- guarded-wdk가 daemon/relay/app를 import해도 빌드가 깨지지 않음
- daemon/relay에서 browser global (window, document)을 사용해도 감지 안 됨
- require()로 CJS import해도 에러 없음
- 타입 의존성 그래프가 없어 패키지 내부 구조 파악이 어려움
- 아키텍처 이해를 돕는 Claude 스킬이 없음

### 원인
- v0.1.0~v0.1.2에서 기능 구현에 집중, 정적 분석/CI 체크를 설정하지 않음
- HypurrQuant에는 39개 CI 체크가 있지만 WDK-APP에는 0개

### 영향
- 패키지 경계 위반이 코드 리뷰에서만 잡힘 (자동화 없음)
- 리팩토링 시 의존성 깨짐을 사전에 감지할 수 없음
- 새 개발자가 아키텍처를 이해하기 어려움

### 목표

**CI 체크 (scripts/check)**:
1. `no-cross-package-import` — daemon↔relay↔app 상호 import 금지
2. `guarded-wdk-no-app-import` — 서명 엔진이 상위 패키지 import 금지
3. `server-no-browser-globals` — daemon/relay에서 window/document 금지
4. `no-require-imports` — CJS require() 금지 (ESM only)
5. `package-exports-boundary` — 선언된 public API만 import 가능
6. `dead-files` — 도달 불가능한 파일 탐지
7. `typescript-compile` — tsc --noEmit 통과
8. `no-type-assertion` — guarded-wdk에서 `as any` 금지

**type-dep-graph**:
9. 패키지별 타입 의존성 그래프 생성 (DOT + Mermaid + JSON)
10. guarded-wdk, daemon, relay, manifest 4개 패키지

**Claude 스킬 2개**:
11. `/ci` 스킬 — CI 체크 생성/관리 가이드 (HypurrQuant ci-check-creator 포팅)
12. `/arch` 스킬 — 패키지별 타입 아키텍처 이해 가이드 (HypurrQuant core-type-architecture 포팅)

### 비목표 (Out of Scope)
- HypurrQuant의 DEX/pool/swap 관련 체크 (WDK-APP에 해당 없음)
- React 컴포넌트 관련 체크 (deprecated-spinner 등)
- wagmi/web3 관련 체크
- dead-exports (dead-files보다 우선순위 낮음)
- DDD layer deps (Phase 2에서 daemon 아키텍처 정리 후)

## 제약사항
- HypurrQuant의 check 프레임워크 (registry + runner + shared utils) 패턴을 차용하되, WDK-APP에 맞게 재구현
- ts-morph 의존성 추가 (type-dep-graph용)
- 체크 스크립트는 `scripts/check/` 디렉토리에 배치
- 스킬은 `~/.claude/skills/` 에 배치 (프로젝트 레벨이 아닌 글로벌)

## 참조
- HypurrQuant check 프레임워크: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/`
- HypurrQuant type-dep-graph: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/type-dep-graph/`
- HypurrQuant ci-check-creator 스킬: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/.claude/skills/ci-check-creator/`
- HypurrQuant core-type-architecture 스킬: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/.claude/skills/core-type-architecture/`
