# DoD (Definition of Done) - v0.1.3

## 기능 완료 조건

### CI 체크 프레임워크

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `npx tsx scripts/check/index.ts` 실행 시 7개 아키텍처 체크 실행 (typescript-compile은 Phase 2) | 실행 → 7개 체크 이름 표시, PASS 7/7 |
| F2 | `--check=name` 개별 체크 실행 가능 | `npx tsx scripts/check/index.ts --check=cross/no-require-imports` → 해당 체크만 |
| F3 | 아키텍처 체크 7개 PASS (typescript-compile은 Phase 2 — 외부 JS 라이브러리 타입 불일치 해소 필요) | 실행 → 7/7 PASS |
| F4 | `tsx` devDependency가 루트 package.json에 추가됨 | `grep tsx package.json` |

### 개별 체크 (positive + negative 검증)

| # | 조건 | positive 검증 (현재 코드 PASS) | negative 검증 (위반 감지) |
|---|------|------|------|
| F5 | `no-cross-package-import` | 현재 코드 violation 0 | `scripts/check/__fixtures__/cross-import.ts` fixture에서 violation 발생 |
| F6 | `guarded-wdk-no-app-import` | 현재 코드 violation 0 | fixture에서 violation 발생 |
| F7 | `server-no-browser-globals` (daemon+relay 스캔) | 현재 코드 violation 0 | fixture에서 violation 발생 |
| F8 | `no-require-imports` (src만 스캔, tests 제외 — CJS mock 패턴 허용) | 현재 src 코드 violation 0 (require 있으면 수정) | fixture에서 violation 발생 |
| F9 | `package-exports-boundary` | 현재 코드 violation 0 | fixture에서 violation 발생 |
| F10 | `dead-files` | 현재 코드 dead file 0 | fixture에서 dead file 감지 |
| F11 | `typescript-compile` (Phase 2 이관 — 외부 JS 라이브러리 타입 불일치) | Phase 2에서 @tetherto/wdk + ioredis 타입 정의 작업 후 | — |
| F12 | `no-type-assertion` (guarded-wdk) | 현재 코드 violation 0 (as any 있으면 수정) | fixture에서 violation 발생 |

### 코드 수정 (체크 위반 해소)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F13 | guarded-wdk에서 `as any` 사용이 0개 | `grep -r "as any" packages/guarded-wdk/src/` → 매칭 없음 |
| F14 | src 코드에서 `require()` import가 0개 (tests는 CJS mock 허용) | `grep -rn "require(" packages/*/src/` → 매칭 없음 |

### type-dep-graph

| # | 조건 | 검증 방법 |
|---|------|----------|
| F15 | `npx tsx scripts/type-dep-graph/index.ts --include=guarded-wdk` → DOT + Mermaid + JSON | 3개 출력 파일 존재 |
| F16 | 4개 패키지 각각 그래프 생성 가능 | `--include=guarded-wdk,daemon,relay,manifest` → 4패키지 노드 |
| F17 | JSON 출력에 nodes + edges 비어있지 않음 | JSON → nodes.length > 0 |

### Claude 스킬

| # | 조건 | 검증 방법 |
|---|------|----------|
| F18 | `~/.claude/skills/wdk-ci-check/SKILL.md` 존재 | 파일 확인 |
| F19 | `~/.claude/skills/wdk-type-architecture/SKILL.md` 존재 | 파일 확인 |
| F20 | /ci 스킬에 "npx tsx scripts/check" 실행 방법 포함 | grep 확인 |
| F21 | /arch 스킬에 "type-dep-graph" 해석 방법 포함 | grep 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 기존 테스트 전부 통과 | `npm test` (4 프로젝트: canonical, guarded-wdk, manifest, daemon) → 전부 passed |
| N2 | ts-morph + tsx devDependency 추가됨 | package.json 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 존재하지 않는 --check 이름 | 에러 + 사용 가능한 체크 목록 | 실행 확인 |
| E2 | 존재하지 않는 --include 패키지 | 에러 메시지 | 실행 확인 |
