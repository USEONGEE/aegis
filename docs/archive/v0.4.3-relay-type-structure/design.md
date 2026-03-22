# 설계 - v0.4.3

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 컴포넌트 수정 (registry-adapter.ts, pg-registry.ts, auth.ts, ws.ts), 신규 파일 추가 (actor-types.ts), 내부 export 타입 시그니처 변경

---

## 문제 요약
relay 패키지에서 `'daemon'|'app'` 리터럴 10곳 인라인 반복, 7쌍 Record/CreateParams 독립 정의 (extends 0건), ListItem 수동 복제로 `DeviceListItem.type: string` 타입 버그.

> 상세: [README.md](README.md) 참조

## 접근법
3단계 순차 리팩토링: **A → B → C** (각 단계는 이전 단계에 의존)
1. **Step A**: actor-types.ts 신설 + 리터럴 alias 추출 + dead alias 삭제
2. **Step B**: Record extends CreateParams + intersection type 제거
3. **Step C**: ListItem = Pick<Record, ...> 파생

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 3단계 순차 (alias → extends → Pick) | 각 단계 독립 tsc 통과, diff 깔끔, 문제 격리 가능 | 3개 커밋 | ✅ |
| B: 한 번에 전부 변경 | 커밋 1개 | diff 복잡, 리뷰 어려움, 문제 원인 추적 어려움 | ❌ |
| C: extends 없이 Pick만 적용 | 최소 변경 | Record/CreateParams 관계 미표현, drift 방지 안됨 | ❌ |

**선택 이유**: A는 각 단계가 독립적으로 tsc 통과하므로 문제 발생 시 특정 단계로 격리 가능. Step A(alias)가 Step B(extends)의 전제조건이므로 순서가 자연스러움.

## 기술 결정

1. **actor-types.ts 위치**: `packages/relay/src/registry/actor-types.ts` — registry 도메인의 leaf 타입
2. **의미별 alias 분리**: `DeviceType`(디바이스 종류) ≠ `SubjectRole`(인증 주체 역할). 기저 타입 없이 각각 독립 선언
3. **import surface 결정**: `actor-types.ts`에서 export, `registry-adapter.ts`에서 **re-export**. 외부 소비자(auth.ts 등)는 `registry-adapter.ts` 또는 `actor-types.ts` 어디서든 import 가능하되, **`registry-adapter.ts`가 표준 public surface**. dead-exports 체크는 `actor-types.ts`의 export가 `registry-adapter.ts`에서 re-export되므로 dead가 아님
4. **extends 패턴**: v0.2.1 `Stored extends Input` 선례 그대로 적용
5. **intersection type 제거**: `getUser`, `getDaemon` 둘 다 intersection 삭제. 소비자 null 가드로 안전성 유지

## 범위 / 비범위
- **범위(In Scope)**: actor-types.ts 신설, registry-adapter.ts 타입 변경, pg-registry.ts 시그니처, auth.ts 내부 타입, ws.ts dead alias 삭제
- **비범위(Out of Scope)**: pg-registry.ts SQL RETURNING 변경, rate-limit.ts, 외부 패키지, 신규 테스트

## 아키텍처 개요

변경 후 import 관계:

```
actor-types.ts (신설)
  export: DeviceType, SubjectRole
       │
       ▼
registry-adapter.ts (re-export + 소비)
  re-export: DeviceType, SubjectRole
  사용: DeviceRecord.type: DeviceType, RefreshTokenRecord.role: SubjectRole, ...
  변경: Record extends CreateParams (7쌍), ListItem = Pick (2개)
       │
       ├──→ pg-registry.ts (시그니처 정합)
       │      revokeAllRefreshTokens(role: SubjectRole)
       │
       ├──→ auth.ts (import + 소비)
       │      JwtPayload.role: SubjectRole
       │      PairBody.type: DeviceType
       │      issueRefreshToken(role: SubjectRole)
       │
       └──→ ws.ts (dead alias 삭제만)
```

## API/인터페이스 계약 변경

| 심볼 | 변경 전 | 변경 후 | 파일 |
|------|---------|---------|------|
| `DeviceRecord.type` | `'daemon' \| 'app'` | `DeviceType` (via extends CreateDeviceParams) | registry-adapter.ts |
| `CreateDeviceParams.type` | `'daemon' \| 'app'` | `DeviceType` | registry-adapter.ts |
| `RefreshTokenRecord.role` | `'daemon' \| 'app'` | `SubjectRole` (via extends CreateRefreshTokenParams) | registry-adapter.ts |
| `CreateRefreshTokenParams.role` | `'daemon' \| 'app'` | `SubjectRole` | registry-adapter.ts |
| `RegistryAdapter.revokeAllRefreshTokens` | `role: 'daemon' \| 'app'` | `role: SubjectRole` | registry-adapter.ts |
| `RegistryAdapter.getUser` | `Promise<(UserRecord & { passwordHash: string }) \| null>` | `Promise<UserRecord \| null>` | registry-adapter.ts |
| `RegistryAdapter.getDaemon` | `Promise<(DaemonRecord & { secretHash: string }) \| null>` | `Promise<DaemonRecord \| null>` | registry-adapter.ts |
| `DeviceListItem` | `interface { type: string; ... }` | `Pick<DeviceRecord, 'id' \| 'type' \| 'pushToken' \| 'lastSeenAt'>` | registry-adapter.ts |
| `SessionListItem` | `interface { ... }` | `Pick<SessionRecord, 'id' \| 'metadata' \| 'createdAt'>` | registry-adapter.ts |
| `JwtPayload.role` | `'daemon' \| 'app'` | `SubjectRole` | auth.ts |
| `PairBody.type` | `'daemon' \| 'app'` | `DeviceType` | auth.ts |
| `PgRegistry.revokeAllRefreshTokens` | `role: 'daemon' \| 'app'` | `role: SubjectRole` | pg-registry.ts |

모든 변경은 structural typing 호환. `'daemon' | 'app'` 리터럴 값 자체는 동일하므로 런타임 파괴 없음.

## 테스트 전략
- **tsc --noEmit**: 모든 변경 후 전체 컴파일 통과 확인 (핵심 검증)
- **기존 테스트**: relay 패키지의 기존 테스트 회귀 확인
- **런타임 영향 없음**: 모든 변경이 순수 타입 리팩토링. JS 출력물 차이 없음

---

## 현재 상태 분석

### 1. 인라인 리터럴 `'daemon' | 'app'` (10곳 + dead alias 1건)

두 가지 의미가 같은 리터럴로 혼용되고 있다:

| 의미 | 사용처 | 설명 |
|------|--------|------|
| **DeviceType** (디바이스 종류) | `DeviceRecord.type`, `CreateDeviceParams.type`, `PairBody.type` | 디바이스가 daemon인지 app인지 |
| **SubjectRole** (인증 주체 역할) | `RefreshTokenRecord.role`, `CreateRefreshTokenParams.role`, `JwtPayload.role`, `issueRefreshToken(role)`, `revokeAllRefreshTokens(role)` | JWT/refresh token의 인증 주체가 daemon인지 app인지 |
| **Dead alias** | `ws.ts:15 type Role` | 선언 후 미사용 |

현재 열거값 `'daemon' | 'app'`이 동일하지만 도메인 의미가 다르다. 향후 새 역할 추가 시 10곳을 수동으로 찾아 변경해야 한다.

### 2. Record/CreateParams 독립 정의 (7쌍, extends 0건)

```
UserRecord           {id, passwordHash, createdAt}
CreateUserParams     {id, passwordHash}            ← 겹침: id, passwordHash

DeviceRecord         {id, userId, type, pushToken, lastSeenAt, createdAt}
CreateDeviceParams   {id, userId, type, pushToken}  ← 겹침: id, userId, type, pushToken

SessionRecord        {id, userId, metadata, createdAt}
CreateSessionParams  {id, userId, metadata}         ← 겹침: id, userId, metadata

DaemonRecord         {id, secretHash, createdAt}
CreateDaemonParams   {id, secretHash}               ← 겹침: id, secretHash

DaemonUserRecord     {daemonId, userId, boundAt}
CreateDaemonUserParams {daemonId, userId}            ← 겹침: daemonId, userId

RefreshTokenRecord   {id, subjectId, role, deviceId, expiresAt, createdAt, revokedAt}
CreateRefreshTokenParams {id, subjectId, role, deviceId, expiresAt} ← 겹침: 5필드

EnrollmentCodeRecord {code, daemonId, expiresAt, usedAt}
CreateEnrollmentCodeParams {code, daemonId, expiresAt} ← 겹침: code, daemonId, expiresAt
```

모든 쌍에서 CreateParams의 필드 전체가 Record에 포함된다. Record = CreateParams + DB가 추가하는 필드(createdAt, revokedAt, usedAt 등).

### 3. ListItem 수동 복제 + 타입 버그

```ts
// DeviceRecord.type: 'daemon' | 'app'
// DeviceListItem.type: string  ← BUG: widening
interface DeviceListItem {
  id: string
  type: string           // 'daemon' | 'app'이어야 하는데 string
  pushToken: string | null
  lastSeenAt: Date | null
}
```

`DeviceListItem = Pick<DeviceRecord, 'id' | 'type' | 'pushToken' | 'lastSeenAt'>`였다면 이 버그는 발생하지 않았다.

`SessionListItem`은 현재 정확하지만 역시 수동 복제 상태.

### 4. getUser/getDaemon의 intersection type 분석

```ts
// registry-adapter.ts:125
abstract getUser (id: string): Promise<(UserRecord & { passwordHash: string }) | null>

// registry-adapter.ts:157
abstract getDaemon (id: string): Promise<(DaemonRecord & { secretHash: string }) | null>
```

**getUser의 intersection:**
- `UserRecord.passwordHash`는 `string | null` (OAuth 유저는 null)
- `getUser` 반환 타입은 `UserRecord & { passwordHash: string }` -- passwordHash를 non-null string으로 좁힘
- auth.ts:283에서 `if (!user || !user.passwordHash)` 가드를 사용하므로 이 좁힘이 실질적으로 필요 없음
- 그러나 이 intersection의 의도는 "DB에서 가져올 때 passwordHash 컬럼을 반드시 SELECT한다"는 계약

**getDaemon의 intersection:**
- `DaemonRecord.secretHash`는 이미 `string` (non-nullable)
- `DaemonRecord & { secretHash: string }`는 `DaemonRecord`와 동일 -- **완전히 무의미한 intersection**

**결론:**
- `getDaemon`의 intersection은 삭제. 반환 타입을 `DaemonRecord | null`로 단순화
- `getUser`의 intersection은 v0.4.0에서 UserRecord.passwordHash가 `string | null`로 확정되었으므로, auth.ts에서 이미 null 가드(`!user.passwordHash`)를 수행한다. intersection을 유지할 실익이 없다. 반환 타입을 `UserRecord | null`로 단순화하고, 소비자가 null 가드에 의존하도록 한다.

---

## 변경 순서 (의존성 기반)

### Step A: actor-types.ts 신설 + 리터럴 추출

**변경 파일:**
1. `packages/relay/src/registry/actor-types.ts` (신설)
2. `packages/relay/src/registry/registry-adapter.ts` (import + 치환)
3. `packages/relay/src/registry/pg-registry.ts` (시그니처 변경 전파)
4. `packages/relay/src/routes/auth.ts` (import + 치환)
5. `packages/relay/src/routes/ws.ts` (dead alias 삭제)

**내용:**

```ts
// packages/relay/src/registry/actor-types.ts

/** 디바이스 종류: daemon 프로세스 또는 app 클라이언트 */
export type DeviceType = 'daemon' | 'app'

/** 인증 주체 역할: JWT/refresh token의 발급 대상 */
export type SubjectRole = 'daemon' | 'app'
```

치환 매핑:
| 현재 | 변경 후 | 파일 |
|------|---------|------|
| `DeviceRecord.type: 'daemon' \| 'app'` | `DeviceRecord.type: DeviceType` | registry-adapter.ts |
| `CreateDeviceParams.type: 'daemon' \| 'app'` | `CreateDeviceParams.type: DeviceType` | registry-adapter.ts |
| `RefreshTokenRecord.role: 'daemon' \| 'app'` | `RefreshTokenRecord.role: SubjectRole` | registry-adapter.ts |
| `CreateRefreshTokenParams.role: 'daemon' \| 'app'` | `CreateRefreshTokenParams.role: SubjectRole` | registry-adapter.ts |
| `revokeAllRefreshTokens(role: 'daemon' \| 'app')` | `revokeAllRefreshTokens(role: SubjectRole)` | registry-adapter.ts, pg-registry.ts |
| `PairBody.type: 'daemon' \| 'app'` | `PairBody.type: DeviceType` | auth.ts |
| `JwtPayload.role: 'daemon' \| 'app'` | `JwtPayload.role: SubjectRole` | auth.ts |
| `issueRefreshToken(role: 'daemon' \| 'app')` | `issueRefreshToken(role: SubjectRole)` | auth.ts |
| `type Role = 'daemon' \| 'app'` | (삭제) | ws.ts |

**리스크:** 낮음. 타입 alias는 structural typing에서 완전 호환. `'daemon'`/`'app'` 리터럴 값은 변경 없음.

### Step B: Record extends CreateParams 적용 (7쌍)

**변경 파일:**
1. `packages/relay/src/registry/registry-adapter.ts` (핵심)
2. `packages/relay/src/registry/pg-registry.ts` (반환 타입 변경)
3. `packages/relay/src/routes/auth.ts` (getUser/getDaemon 반환 타입 영향)

**패턴:**

```ts
// Before
export interface CreateUserParams {
  id: string
  passwordHash: string | null
}

export interface UserRecord {
  id: string
  passwordHash: string | null
  createdAt: Date
}

// After
export interface CreateUserParams {
  id: string
  passwordHash: string | null
}

export interface UserRecord extends CreateUserParams {
  createdAt: Date
}
```

7쌍 적용 상세:

| Record | extends CreateParams | Record 추가 필드 |
|--------|---------------------|-----------------|
| `UserRecord` | `CreateUserParams` | `createdAt` |
| `DeviceRecord` | `CreateDeviceParams` | `lastSeenAt`, `createdAt` |
| `SessionRecord` | `CreateSessionParams` | `createdAt` |
| `DaemonRecord` | `CreateDaemonParams` | `createdAt` |
| `DaemonUserRecord` | `CreateDaemonUserParams` | `boundAt` |
| `RefreshTokenRecord` | `CreateRefreshTokenParams` | `createdAt`, `revokedAt` |
| `EnrollmentCodeRecord` | `CreateEnrollmentCodeParams` | `usedAt` |

**intersection type 정리 (이 단계에서 함께 처리):**

```ts
// Before
abstract getUser (id: string): Promise<(UserRecord & { passwordHash: string }) | null>
abstract getDaemon (id: string): Promise<(DaemonRecord & { secretHash: string }) | null>

// After
abstract getUser (id: string): Promise<UserRecord | null>
abstract getDaemon (id: string): Promise<DaemonRecord | null>
```

`getUser` 변경의 소비자 영향 분석:

- **auth.ts:282-287** (`/auth/login`):
  ```ts
  const user = await registry.getUser(userId)
  if (!user || !user.passwordHash) {  // null 가드 이미 존재
    return reply.code(401).send({ error: 'Invalid credentials' })
  }
  // 이 시점에서 user.passwordHash는 TS narrowing으로 string
  if (!verifyPassword(password, user.passwordHash)) { ... }
  ```
  intersection 제거 후에도 `!user.passwordHash` 가드가 `string | null`을 `string`으로 좁히므로 타입 안전성 유지됨.

- **auth.ts:590** (`/auth/google`):
  ```ts
  const existing = await registry.getUser(userId)
  if (!existing) { ... }
  ```
  passwordHash에 접근하지 않음. 영향 없음.

- **auth.ts:252** (`/auth/register`):
  ```ts
  const existing = await registry.getUser(userId)
  if (existing) { return reply.code(409).send(...) }
  ```
  passwordHash에 접근하지 않음. 영향 없음.

`getDaemon` 변경의 소비자 영향 분석:

- **auth.ts:396** (`/auth/daemon/register`):
  ```ts
  const existing = await registry.getDaemon(daemonId)
  if (existing) { return reply.code(409).send(...) }
  ```
  secretHash에 접근하지 않음. 영향 없음.

- **auth.ts:424-429** (`/auth/daemon/login`):
  ```ts
  const daemon = await registry.getDaemon(daemonId)
  if (!daemon) { return reply.code(401).send(...) }
  if (!verifyPassword(secret, daemon.secretHash)) { ... }
  ```
  `DaemonRecord.secretHash`는 `string` (non-nullable)이므로 intersection 제거가 타입에 무영향.

**리스크:** 중간. extends 적용 시 CreateParams에 없는 필드만 Record body에 남겨야 한다. pg-registry.ts의 SQL RETURNING절이 Record의 모든 필드를 반환하는지 확인 필요.

PgRegistry RETURNING절 검증:

| 메서드 | RETURNING | Record 필드 | 누락 |
|--------|-----------|------------|------|
| `createUser` | `id, createdAt` | `id, passwordHash, createdAt` | passwordHash 누락 (but CreateUserParams에서 상속) |
| `createDevice` | `id, userId, type, createdAt` | `id, userId, type, pushToken, lastSeenAt, createdAt` | pushToken, lastSeenAt 누락 |
| `createSession` | `id, userId, createdAt` | `id, userId, metadata, createdAt` | metadata 누락 |
| `createDaemon` | `id, secretHash, createdAt` | `id, secretHash, createdAt` | 없음 |
| `bindUser` | `daemonId, userId, boundAt` | `daemonId, userId, boundAt` | 없음 |
| `createRefreshToken` | 전체 반환 | 전체 | 없음 |
| `createEnrollmentCode` | `code, daemonId, expiresAt, usedAt` | `code, daemonId, expiresAt, usedAt` | 없음 |

createUser/createDevice/createSession의 RETURNING이 Record의 일부 필드를 누락한다. 이는 **기존 버그**이다 -- `Promise<UserRecord>`를 선언했지만 실제로는 `passwordHash`가 없는 객체를 반환. 그러나 이 반환값의 소비자(auth.ts)는 누락된 필드에 접근하지 않으므로 런타임 오류는 없다.

이 RETURNING 불완전성은 이번 리팩토링의 범위가 아니다 (PRD의 비목표: "pg-registry.ts SQL 변경"). extends 적용 자체는 이 기존 상황을 변경하지 않는다.

### Step C: ListItem = Pick<Record, ...> 파생으로 전환

**변경 파일:**
1. `packages/relay/src/registry/registry-adapter.ts` (핵심)

**내용:**

```ts
// Before
export interface DeviceListItem {
  id: string
  type: string              // BUG
  pushToken: string | null
  lastSeenAt: Date | null
}

export interface SessionListItem {
  id: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

// After
export type DeviceListItem = Pick<DeviceRecord, 'id' | 'type' | 'pushToken' | 'lastSeenAt'>
export type SessionListItem = Pick<SessionRecord, 'id' | 'metadata' | 'createdAt'>
```

`DeviceListItem.type`이 `string`에서 `DeviceType`으로 좁아진다.

소비자 영향 분석:

- **pg-registry.ts:105-112** (`getDevicesByUser`): SQL SELECT가 `id, type, pushToken, lastSeenAt`를 반환. DB의 `type` 컬럼은 `'daemon' | 'app'`만 저장하므로 런타임 호환.
- **pg-registry.ts:152-159** (`getSessionsByUser`): SQL SELECT가 `id, metadata, createdAt`를 반환. 변경 없음.
- **ws.ts:525** (`pushToOfflineApps`): `device.type === 'app'` 비교. type이 `DeviceType`으로 좁아지면 타입 체커가 이 비교를 더 정확하게 검증. 기능 변경 없음.

**리스크:** 낮음. Pick은 structural subtype이므로 기존 소비 코드 호환. `DeviceListItem.type`이 `string`에서 `DeviceType`으로 좁아지는 것은 breaking이 아님 (좁아지는 방향).

---

## 전체 영향 파일 목록

| 파일 | Step A | Step B | Step C | 변경 유형 |
|------|--------|--------|--------|-----------|
| `registry/actor-types.ts` | 신설 | - | - | 새 파일 |
| `registry/registry-adapter.ts` | 수정 | 수정 | 수정 | 타입 정의 |
| `registry/pg-registry.ts` | 수정 | 수정 | - | 시그니처 |
| `routes/auth.ts` | 수정 | 수정 | - | import + 타입 |
| `routes/ws.ts` | 수정 | - | - | dead code 삭제 |
| `middleware/rate-limit.ts` | - | - | - | 영향 없음 |
| `queue/*` | - | - | - | 영향 없음 |
| `config.ts` | - | - | - | 영향 없음 |
| `index.ts` | - | - | - | 영향 없음 |

---

## 리스크 평가와 완화

### 1. extends 적용 시 필드 순서/구조 불일치

**리스크:** CreateParams에 없는 필드가 Record body에 남아야 하는데, 실수로 중복 선언할 수 있음.
**완화:** tsc가 "Property X is declared in both CreateParams and Record" 경고를 발생시킴. CI에서 잡힘.

### 2. PgRegistry RETURNING 불완전 (기존 이슈)

**리스크:** createUser가 `Promise<UserRecord>`를 선언하지만 RETURNING에 passwordHash가 없음.
**완화:** 이번 범위가 아님. 기존 동작 유지. extends 적용이 이 상황을 악화시키지 않음.

### 3. pg 드라이버의 row 타입 추론

**리스크:** `this.pool.query`의 `rows[0]`은 `any`로 추론되므로, Record extends CreateParams 적용 자체가 런타임에 영향 없음.
**완화:** 타입 변경은 컴파일 타임 계약만 변경. SQL 결과는 동일.

### 4. DeviceListItem.type 좁힘의 하위 호환

**리스크:** 외부에서 `DeviceListItem`을 `{ type: string }`으로 사용하던 코드가 있을 수 있음.
**완화:** relay 패키지 외부에서 이 타입을 import하는 곳이 없음 (grep 확인). 모노레포 내부 breaking 허용.

### 5. actor-types.ts import 경로

**리스크:** 새 파일 추가로 인한 import 경로 관리.
**완화:** registry-adapter.ts에서 re-export하여 기존 import 경로 유지. auth.ts 등 소비자는 `registry-adapter.ts`에서 import하는 것을 표준으로 한다.

---

## 테스팅 전략

1. **tsc --noEmit**: 모든 변경 후 전체 컴파일 통과 확인 (가장 중요)
2. **기존 테스트**: relay 패키지의 기존 테스트가 있다면 통과 확인
3. **수동 검증 불필요**: 모든 변경이 순수 타입 리팩토링 (런타임 코드 변경 없음, SQL 변경 없음)
4. **dead-exports CI 체크**: 새로 export되는 `DeviceType`, `SubjectRole`이 사용되는지 확인

---

## 성공 지표

1. `'daemon' | 'app'` 인라인 리터럴 0건 (actor-types.ts의 정의 2건 제외)
2. 7쌍 모두 `Record extends CreateParams` 적용 완료
3. `DeviceListItem = Pick<DeviceRecord, ...>`, `SessionListItem = Pick<SessionRecord, ...>` 파생
4. `DeviceListItem.type`이 `DeviceType` (not `string`)
5. `getUser` 반환 타입에서 intersection 제거, `getDaemon` 반환 타입에서 intersection 제거
6. `ws.ts`의 dead `type Role` 삭제
7. `tsc --noEmit` 통과
8. 코드 diff에서 런타임 로직 변경 0건

---

## 변경 순서 근거

Step A -> B -> C 순서는 의존성에 기반한다:

1. **A가 선행**: B에서 `DeviceRecord extends CreateDeviceParams` 적용 시, CreateDeviceParams.type이 이미 `DeviceType`이어야 extends가 자연스럽다. A 없이 B를 먼저 하면 extends 후 인라인 리터럴을 치환해야 하는데, 이는 diff가 복잡해진다.
2. **B가 C에 선행**: C의 `Pick<DeviceRecord, ...>`는 DeviceRecord가 최종 shape여야 의미가 있다. B에서 extends를 적용한 후의 DeviceRecord를 Pick 대상으로 사용한다.
3. **각 Step은 독립 커밋 가능**: A만 적용해도 컴파일 통과, A+B만 적용해도 컴파일 통과. 점진적 머지 가능.
