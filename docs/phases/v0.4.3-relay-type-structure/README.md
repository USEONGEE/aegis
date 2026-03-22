# Relay 타입 구조 정리 - v0.4.3

## 기준선

이 PRD는 **v0.4.0 (No Optional 원칙 전면 적용) 완료 후의 코드 상태**를 기준으로 작성되었다.
v0.4.0이 relay의 optional→nullable 정리 12건(#43~#54)을 완료한 뒤에 착수한다.
현재 워크스페이스에는 아직 optional 필드가 남아있으나, 이 Phase는 v0.4.0 landed 이후를 전제한다.

## 문제 정의

### 현상

relay 패키지의 `packages/relay/src/` 전반에 3가지 구조적 타입 문제가 있다.

**1. 리터럴 유니온 `'daemon' | 'app'` 인라인 반복 (10곳 + dead alias 1건)**

공개 타입 surface (export된 interface/class):

```
registry-adapter.ts:14  DeviceRecord.type:              'daemon' | 'app'
registry-adapter.ts:48  CreateDeviceParams.type:        'daemon' | 'app'
registry-adapter.ts:78  RefreshTokenRecord.role:        'daemon' | 'app'
registry-adapter.ts:88  CreateRefreshTokenParams.role:  'daemon' | 'app'
registry-adapter.ts:181 RegistryAdapter.revokeAllRefreshTokens(role): 'daemon' | 'app'
routes/auth.ts:105      JwtPayload.role:                'daemon' | 'app'
```

구현/내부 사용 (수정 필요하나 export 아님):

```
routes/auth.ts:77       PairBody.type:                  'daemon' | 'app'
routes/auth.ts:183      issueRefreshToken(role):        'daemon' | 'app'
pg-registry.ts:257      PgRegistry.revokeAllRefreshTokens(role): 'daemon' | 'app'
```

Dead alias (삭제 대상):

```
routes/ws.ts:15         type Role = 'daemon' | 'app'   (선언만 있고 미사용)
```

도메인적으로 `DeviceRecord.type`(디바이스 종류)과 `RefreshTokenRecord.role`(인증 주체 역할)은 다른 개념이지만, 같은 열거값을 공유한다. 이름이 없어 구분이 불가능하다.

**2. Record/CreateParams 독립 정의 — extends 0건**

7쌍의 Record + CreateParams가 각각 독립 interface:

| Record | CreateParams | 겹치는 필드 |
|--------|-------------|------------|
| UserRecord | CreateUserParams | id, passwordHash |
| DeviceRecord | CreateDeviceParams | id, userId, type, pushToken |
| SessionRecord | CreateSessionParams | id, userId, metadata |
| DaemonRecord | CreateDaemonParams | id, secretHash |
| DaemonUserRecord | CreateDaemonUserParams | daemonId, userId |
| RefreshTokenRecord | CreateRefreshTokenParams | id, subjectId, role, deviceId, expiresAt |
| EnrollmentCodeRecord | CreateEnrollmentCodeParams | code, daemonId, expiresAt |

v0.2.1에서 guarded-wdk에 확립한 `Stored extends Input` 패턴이 relay에 미적용. 타입 그래프에서 두 타입이 같은 depth 0에 독립 leaf로 존재하여, 관계가 타입으로 표현되지 않는 중복 상태.

**3. ListItem 수동 복제 + 타입 버그**

```ts
// DeviceRecord.type은 'daemon' | 'app'인데
// DeviceListItem.type은 string — 타입 계약 버그
interface DeviceListItem {
  id: string
  type: string          // ← 여기가 string
  pushToken: string | null
  lastSeenAt: Date | null
}
```

`DeviceListItem`과 `SessionListItem`이 각각의 Record에서 필드를 수동 복제한 sibling leaf. Pick/Omit으로 파생하지 않아 drift가 발생하여 `DeviceListItem.type`이 `string`으로 widening된 상태.

### 원인

1. **이름 없는 반복**: `'daemon' | 'app'`이 타입 alias 없이 인라인으로 사용되어, 의미 구분과 일괄 변경이 불가능
2. **v0.2.1 패턴 미전파**: guarded-wdk에서 확립한 `Stored extends Input`이 relay 패키지로 전파되지 않음. relay는 v0.1.0 초기 구조가 그대로 잔존
3. **수동 복제 drift**: ListItem을 Record에서 Pick으로 파생하지 않고 독립 정의하여, 필드 타입이 발산

### 영향

1. **타입 계약 버그**: `DeviceListItem.type: string`은 DB schema(`'daemon' | 'app'`)와 불일치. `ws.ts`의 `pushToOfflineApps`에서 `device.type === 'app'` 분기의 타입 안전성이 보장되지 않음
2. **관계 미표현**: Record와 CreateParams의 extends 관계가 없어, "CreateParams에 필드를 추가했는데 Record에는 빠뜨림" 같은 drift가 방지되지 않음
3. **DRY 위반**: 같은 리터럴 유니온 10곳 반복. 새 역할(예: `'operator'`) 추가 시 10곳 모두 수동 수정 필요
4. **v0.2.1과의 불일치**: 모노레포 내 패키지 간 타입 패턴 일관성 저하

### 목표

- `'daemon' | 'app'` 리터럴을 의미별 타입 alias로 추출 (`DeviceType`, `SubjectRole`)
- 7쌍의 Record/CreateParams에 `Record extends CreateParams` 패턴 적용
- ListItem을 `Pick<Record, ...>` 파생으로 전환하여 drift 방지 + `DeviceListItem.type` 버그 해소
- `ws.ts`의 dead `type Role` 삭제
- 변경 후 tsc 통과, 기존 동작 유지

### 비목표 (Out of Scope)

- optional→nullable 정리 (v0.4.0 범위)
- RegistryAdapter 분할 (DeviceRegistry/TokenRegistry 등) — breadth 경고만 존재, 현 단계에서 분할 불요
- RelayEnvelope discriminated union 분리 (cross-package breaking, 별도 phase)
- 다른 패키지(guarded-wdk, daemon, manifest)의 동일 패턴 적용
- pg-registry.ts SQL 변경 (RETURNING 확장 등은 v0.4.0 범위)
- 신규 테스트 추가

## 제약사항

- **v0.4.0 선행 필수**: optional→nullable 정리가 끝나야 extends 적용이 가능 (optional 필드가 있으면 Record extends CreateParams의 shape가 맞지 않음)
- packages/relay/src/ 내부만 변경, 외부 패키지 영향 없음
- Breaking change 허용 (모노레포 내부, export 타입 시그니처 변경)
- 패키지 간 의존 방향 변경 없음

## 근거 자료

이 PRD의 모든 문제와 해결 방향은 동일 대화에서 수행한 다음 분석에 기반한다:

1. **타입 의존성 그래프**: `docs/type-dep-graph/type-dep-graph.json` (relay 패키지 --include=relay로 생성)
   - 생성 명령: `npx tsx scripts/type-dep-graph/index.ts --include=relay --json`
   - 35 nodes, 48 edges, depth 0~2 레이어 구조
2. **arch-one-pager**: relay 전체 구조 파악 (4 도메인: Queue/Registry/RateLimit/Config, 3 기능 축: 메시지 중계/인증/요청 보호)
3. **wdk-type-architecture 직교성 검증**: depth별 3가지 기준 (계층적 합성, 단방향 참조, 같은 높이 직교) 적용
4. **Codex 토론 7회** (sessionId: `/Users/mousebook/Documents/GitHub/WDK-APP/8`):
   - #1: Record vs ListItem 중복 → Pick 파생 권장, DeviceListItem.type 버그 확인
   - #2: Record vs CreateParams → v0.2.1 Stored extends Input 미적용 확인
   - #3: 인라인 리터럴 → DeviceType ≠ SubjectRole, 의미별 alias 분리 권장
   - #4: Optional 필드 7건 전수 조사 (v0.4.0 범위)
   - #5: Depth 1 직교성 통과
   - #6: Depth 2 직교성 통과
   - #7: RelayEnvelope wide bag (별도 phase 범위)
