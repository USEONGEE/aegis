# DoD (Definition of Done) - v0.2.8

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `npx tsc -p packages/manifest/tsconfig.json --noEmit` 에러 0 | tsc 실행 후 exit code 0 확인 |
| F2 | `manifestToPolicy(manifest, chainId)` 기본 decision이 `'ALLOW'` | 테스트: `dict[addr][sel][0].decision === 'ALLOW'` |
| F3 | `manifestToPolicy()` 결과를 `{ type: 'call', permissions: dict }`로 감싸서 guarded-wdk `validatePolicies()` 통과 | 통합 테스트: `import { validatePolicies } from '@wdk-app/guarded-wdk'` (public API)로 검증 |
| F4 | `Feature` 인터페이스에서 `constraints` 필드 제거됨 | `grep -r 'constraints' packages/manifest/src/` 결과 0건 |
| F5a | `Constraint` 인터페이스가 types.ts에서 삭제됨 | `grep 'Constraint' packages/manifest/src/types.ts` 결과 0건 |
| F5b | `Constraint` export가 index.ts에서 삭제됨 | `grep 'Constraint' packages/manifest/src/index.ts` 결과 0건 |
| F6 | `UserConfig`에서 `tokenAddresses`, `userAddress` 필드 제거됨 | `grep -r 'tokenAddresses\|userAddress' packages/manifest/src/` 결과 0건 |
| F7 | `validateManifest()`에서 constraints 검증 코드 제거됨 | `grep 'constraints' packages/manifest/src/validate-manifest.ts` 결과 0건 |
| F8 | aave-v3 example에서 `constraints` 필드 제거됨 | `grep 'constraints' packages/manifest/src/examples/aave-v3.ts` 결과 0건 |
| F9 | guarded-wdk `index.ts`에서 `validatePolicies` public export 추가됨 | `grep 'validatePolicies' packages/guarded-wdk/src/index.ts` 매치 |
| F10 | manifest 테스트에서 사용하는 모든 decision 값이 `'ALLOW'` 또는 `'REJECT'`만 사용 | `grep -E "REQUIRE_APPROVAL\|AUTO" packages/manifest/tests/` 결과 0건 |
| F11 | manifest 통합 테스트가 `@wdk-app/guarded-wdk` public API import를 사용 (deep import 금지) | `grep "from '@wdk-app/guarded-wdk'" packages/manifest/tests/` 매치 + `grep 'guarded-middleware' packages/manifest/tests/` 결과 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | manifest 패키지 tsc strict 에러 0 | `npx tsc -p packages/manifest/tsconfig.json --noEmit` exit 0 |
| N2 | manifest 테스트 전체 통과 | `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config packages/manifest/jest.config.js --runInBand` exit 0 |
| N3 | guarded-wdk 기존 테스트 회귀 없음 | `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config packages/guarded-wdk/jest.config.js --runInBand` exit 0 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `userConfig.decision`에 `'REJECT'` 전달 | 모든 생성된 Rule의 decision이 `'REJECT'` | 테스트: `manifestToPolicy(m, 1, { decision: 'REJECT' })` 검증 |
| E2 | `userConfig`를 생략 (기본값) | 기본 decision `'ALLOW'` 적용 | 테스트: `manifestToPolicy(m, 1)` → decision === 'ALLOW' |
| E3 | approval이 없는 feature만 선택 | wildcard approve rule 미생성 | 기존 테스트 유지: `dict['*']` === undefined |
| E4 | 존재하지 않는 chainId 전달 | 빈 dict 반환 | 기존 테스트 유지: `manifestToPolicy(m, 999)` === `{}` |
| E5 | `features: []` (빈 배열) 전달 | 빈 dict 반환 | 테스트: `manifestToPolicy(m, 1, { features: [] })` === `{}` |
| E6 | auto-generated approve rule의 default decision | `'ALLOW'` 적용 (call rule과 동일) | 테스트: approve rule의 decision === 'ALLOW' 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. tsc 빌드 복원 | F1, N1 | ✅ |
| 2. Decision 값 호환 | F2, F10, E1, E2, E6 | ✅ |
| 3. validatePolicies() 통과 | F3, F9, F11 | ✅ |
| 4. placeholder 완전 제거 | F4, F5a, F5b, F6, F7, F8 | ✅ |
| 5. 통합 검증 테스트 추가 | F3, F11, N2 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| 기본 decision → 'ALLOW' | F2, E2, E6 | ✅ |
| constraints/tokenAddresses/userAddress 제거 | F4, F5a, F5b, F6, F7, F8 | ✅ |
| validatePolicies public API export | F9, F3, F11 | ✅ |
| 통합 검증 테스트 (public API import) | F3, F11, N2 | ✅ |
