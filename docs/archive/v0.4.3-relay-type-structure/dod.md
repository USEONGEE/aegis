# DoD (Definition of Done) - v0.4.3

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `actor-types.ts`에 `DeviceType`과 `SubjectRole`이 export됨 | `rg 'export type DeviceType' packages/relay/src/registry/actor-types.ts` 1건 + `rg 'export type SubjectRole' packages/relay/src/registry/actor-types.ts` 1건 |
| F2 | `registry-adapter.ts`에서 `DeviceType`과 `SubjectRole`이 re-export됨 | `rg "export.*from.*actor-types" packages/relay/src/registry/registry-adapter.ts` 1건 이상 |
| F3 | **타입 위치**의 인라인 `'daemon' \| 'app'` 유니온이 relay/src에서 0건 (actor-types.ts 정의 제외). 런타임 문자열 리터럴(`'daemon'`, `'app'`)과 Fastify JSON schema enum은 유지됨 | `rg "type.*'daemon' \| 'app'" packages/relay/src/ --type ts` + `rg "role.*'daemon' \| 'app'" packages/relay/src/ --type ts` 결과에서 actor-types.ts를 제외하면 0건 |
| F4 | 7쌍의 Record가 모두 CreateParams를 extends | `rg 'extends Create' packages/relay/src/registry/registry-adapter.ts` 7건 |
| F5 | Record body에 CreateParams와 중복되는 필드가 없음 | 코드 리뷰: 각 Record extends 블록에서 CreateParams에 이미 있는 필드(id, userId, type 등)가 재선언되지 않음 |
| F6 | `DeviceListItem`이 `Pick<DeviceRecord, ...>` 파생 | `rg 'Pick<DeviceRecord' packages/relay/src/registry/registry-adapter.ts` 1건 |
| F7 | `SessionListItem`이 `Pick<SessionRecord, ...>` 파생 | `rg 'Pick<SessionRecord' packages/relay/src/registry/registry-adapter.ts` 1건 |
| F8 | `DeviceListItem.type`이 `DeviceType`임 (`string` 아님) | `npx tsc --noEmit -p packages/relay/tsconfig.json` 통과 후, registry-adapter.ts에서 `DeviceListItem`이 `Pick<DeviceRecord, 'id' \| 'type' \| ...>`이고 `DeviceRecord.type`이 `DeviceType`임을 코드 리뷰로 확인 (Pick이 DeviceType을 전파하므로 string이 아님) |
| F9 | `getUser` 반환 타입에서 intersection 제거됨 | `rg 'UserRecord &' packages/relay/src/registry/registry-adapter.ts` 0건 |
| F10 | `getDaemon` 반환 타입에서 intersection 제거됨 | `rg 'DaemonRecord &' packages/relay/src/registry/registry-adapter.ts` 0건 |
| F11 | `ws.ts`의 dead `type Role` 삭제됨 | `rg 'type Role' packages/relay/src/routes/ws.ts` 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | v0.4.3 변경에 의한 새 TypeScript 에러 0건 | `npx tsc --noEmit -p packages/relay/tsconfig.json 2>&1 \| grep -v redis-queue.ts \| grep -v pg-registry.test.ts \| grep 'error TS'` 0건. 기존 baseline 에러(redis-queue.ts ioredis 타입, pg-registry.test.ts mock 타입)는 v0.4.3 범위 밖 |
| N2 | v0.4.3 변경에 의한 새 테스트 실패 0건 | `npm test --workspace=packages/relay` 에서 v0.4.3 변경 파일 관련 새 실패 없음. 기존 실패(registerDevice is not a function)는 v0.4.3 이전부터 존재하는 baseline 실패 |
| N3 | v0.4.3에서 새로 export한 `DeviceType`/`SubjectRole`이 dead export가 아님 | `npx tsx scripts/check/index.ts --check=cross/dead-exports` 결과에서 `actor-types.ts`의 `DeviceType`/`SubjectRole`이 violation으로 보고되지 않음. 기존 baseline 위반(111건)은 v0.4.3 범위 밖 |
| N4 | 순수 타입 리팩토링 확인 — 변경이 interface/type 정의와 import문에만 국한됨 | `git diff packages/relay/src/` 에서 모든 변경이 `interface`, `type`, `import`, `export`, `extends`, `Pick` 키워드에 국한됨을 코드 리뷰로 확인. 런타임 로직(함수 body, SQL, 조건문) 변경 없음 |
| N5 | SQL 변경 0건 | `git diff packages/relay/src/registry/schema.sql` 변경 없음 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | `pg-registry.ts`의 `createUser` RETURNING이 `passwordHash`를 반환하지 않는 기존 상태 | extends 적용 후에도 기존 동작 유지 (pg 드라이버가 `any` 추론하므로 컴파일 에러 없음) | N1 tsc 통과 + auth.ts에서 `createUser` 호출 결과를 담는 변수(`user`/`const`)가 `.passwordHash`에 접근하지 않음을 코드 리뷰로 확인 (auth.ts의 register/google 경로에서 `createUser` 반환 후 `user.id`만 사용) |
| E2 | `auth.ts`에서 `getUser` 반환 후 `!user.passwordHash` null 가드 | intersection 제거 후에도 TS narrowing으로 if 블록 이후 `user.passwordHash`가 `string`으로 좁혀짐 | N1 tsc 통과 (컴파일러가 auth.ts의 null 가드 이후 narrowing을 검증) |
| E3 | `DeviceListItem.type` 좁힘으로 기존 비교 코드 영향 | Pick 파생으로 type이 `DeviceType`이 되어 비교가 더 정확해짐. `device.type === 'app'` 등 기존 비교 호환 | N1 tsc 통과 |
| E4 | `auth.ts` Fastify JSON schema에 `enum: ['daemon', 'app']` 하드코딩 유지 | JSON schema는 변경하지 않음. 런타임 validation은 Fastify schema가 담당하며 타입과 독립 | `rg "enum.*daemon.*app" packages/relay/src/routes/auth.ts` 결과가 변경 전과 동일 (1건 유지: `/auth/pair` schema의 type enum) |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| 리터럴을 의미별 타입 alias로 추출 | F1, F2, F3 |
| 7쌍에 Record extends CreateParams 적용 | F4, F5 |
| ListItem Pick 파생 + DeviceListItem.type 버그 해소 | F6, F7, F8 |
| intersection type 제거 | F9, F10 |
| ws.ts dead Role 삭제 | F11 |
| tsc 통과, 기존 동작 유지 | N1, N2, N4 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| actor-types.ts를 registry/ 에 배치 | F1 |
| registry-adapter.ts에서 re-export | F2 |
| DeviceType ≠ SubjectRole 분리 | F1 |
| A→B→C 순서 | F3(A), F4+F5+F9+F10(B), F6+F7+F8(C) 순서로 검증 |
| extends 패턴 (v0.2.1 선례) | F4, F5 |
| Pick 파생 | F6, F7 |
| getUser/getDaemon intersection 제거 | F9, F10, E1, E2 |
