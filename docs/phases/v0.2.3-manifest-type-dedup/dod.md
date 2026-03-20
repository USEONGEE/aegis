# DoD (Definition of Done) - v0.2.3

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1a | guarded-wdk `index.ts`에서 `ArgCondition` 타입이 public export됨 | `grep "ArgCondition" packages/guarded-wdk/src/index.ts` |
| F1b | guarded-wdk `index.ts`에서 `Decision` 타입이 public export됨 | `grep "Decision" packages/guarded-wdk/src/index.ts` |
| F2 | guarded-wdk `guarded-middleware.ts`에서 `Decision`이 `export type`으로 정의됨 | `grep "export type Decision" packages/guarded-wdk/src/guarded-middleware.ts` |
| F3 | manifest `package.json`에 `@wdk-app/guarded-wdk` 의존이 존재 | `grep "guarded-wdk" packages/manifest/package.json` |
| F4 | manifest `types.ts`에서 `ManifestArgCondition`, `ManifestRule`, `ManifestPermissionDict`, `PolicyPermission` 정의가 제거됨 | `grep -c "ManifestArgCondition\|ManifestRule\|ManifestPermissionDict\|PolicyPermission" packages/manifest/src/types.ts` → 0건 (import/re-export 라인 제외, interface 정의 없음) |
| F5 | manifest `types.ts`에서 guarded-wdk 타입(`ArgCondition`, `Rule`, `PermissionDict`, `Decision`)을 import + re-export | `grep "from '@wdk-app/guarded-wdk'" packages/manifest/src/types.ts` |
| F6 | manifest `types.ts`의 `UserConfig.decision` 필드가 `Decision` 타입 참조 (인라인 리터럴 아님) | `grep "decision.*Decision" packages/manifest/src/types.ts` |
| F7 | `manifestToPolicy()` 반환 타입이 `PermissionDict` | `grep "): PermissionDict" packages/manifest/src/manifest-to-policy.ts` |
| F8a | manifest `index.ts`에서 `ArgCondition` re-export됨 | `grep "ArgCondition" packages/manifest/src/index.ts` |
| F8b | manifest `index.ts`에서 `Rule` re-export됨 | `grep "Rule" packages/manifest/src/index.ts` |
| F8c | manifest `index.ts`에서 `PermissionDict` re-export됨 | `grep "PermissionDict" packages/manifest/src/index.ts` |
| F8d | manifest `index.ts`에서 `Decision` re-export됨 | `grep "Decision" packages/manifest/src/index.ts` |
| F9 | manifest `index.ts`에서 `PolicyPermission`, `ManifestRule`, `ManifestArgCondition`, `ManifestPermissionDict` export가 제거됨 | `grep -c "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/manifest/src/index.ts` → 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk 기존 테스트 전수 통과 | `cd packages/guarded-wdk && node --experimental-vm-modules ../../node_modules/.bin/jest` |
| N2 | manifest 기존 테스트 전수 통과 (15개) | `cd packages/manifest && node --experimental-vm-modules ../../node_modules/.bin/jest` |
| N3 | guarded-wdk TypeScript 타입 체크 통과 | `cd packages/guarded-wdk && npx tsc --noEmit` |
| N4 | manifest TypeScript 타입 체크 통과 | `cd packages/manifest && npx tsc --noEmit` |
| N5 | 순환 의존 없음 (guarded-wdk는 manifest를 import하지 않음) | `grep -r "@wdk-app/manifest" packages/guarded-wdk/` → 0건 |
| N6 | `packages/` 소스 코드에서 제거 대상 타입 이름이 0건 | `grep -r "ManifestRule\|ManifestArgCondition\|ManifestPermissionDict\|PolicyPermission" packages/` → 0건 (docs 제외) |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `manifestToPolicy()` 반환 타입 `PermissionDict`가 guarded-wdk 타입과 컴파일 타임 호환 | TypeScript 타입 체크 통과 (반환 타입 어노테이션이 guarded-wdk `PermissionDict`이므로 `tsc --noEmit` 성공 = 타입 호환 증명) | N4 (`cd packages/manifest && npx tsc --noEmit`) |
| E2 | `UserConfig.decision` optional 필드 유지 | `decision?` optional 유지, `Decision` 타입 사용 | `grep "decision?:" packages/manifest/src/types.ts` |
| E3 | unknown chainId로 `manifestToPolicy()` 호출 | 빈 dict `{}` 반환 (기존 동작 유지) | manifest 테스트 `"returns empty dict for unknown chainId"` 통과 (N2) |
| E4 | approval 없는 feature의 manifest 변환 | approve rule 미생성 (기존 동작 유지) | manifest 테스트 `"features without approvals do not generate approve rules"` 통과 (N2) |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| manifest가 guarded-wdk 정책 타입 직접 참조 | F3, F5 | ✅ |
| manifest 내 중복 타입 제거 | F4, F9, N6 | ✅ |
| 미사용 타입(PolicyPermission) 제거 | F4, F9, N6 | ✅ |
| manifestToPolicy() 반환 타입 통일 | F7, E1 | ✅ |
| guarded-wdk에서 ArgCondition, Decision export 추가 | F1a, F1b, F2 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| manifest → guarded-wdk 의존 추가 | F3, N5 | ✅ |
| guarded-wdk ArgCondition, Decision export 추가 | F1a, F1b, F2, N1 | ✅ |
| manifest에서 guarded-wdk 타입 re-export | F5, F8a-F8d | ✅ |
| Breaking change (타입 이름 변경) | F4, F9, N6 | ✅ |
| Decision 하드코딩 → 타입 참조 | F6 | ✅ |
