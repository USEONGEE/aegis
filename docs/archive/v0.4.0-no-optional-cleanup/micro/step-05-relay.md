# Step 05: relay 타입 정리

## 메타데이터
- **난이도**: 🟡 보통 (대부분 required+null 변환)
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (RelayEnvelope required+null 확정)
- **위반 ID**: #43~#54 (총 12건)
- **DoD 항목**: F13, F14, F15, N1, N2, E4

---

## 1. 구현 내용 (design.md 기반)

### #43 `PairBody.pushToken?` -- Wide Bag
- daemon/app 구분을 `type` 필드로 DU 분리:
  - `{ deviceId: string; type: 'daemon' }`
  - `{ deviceId: string; type: 'app'; pushToken: string | null }`

### #44~#46 `JwtPayload.deviceId?`, `signAppToken.deviceId?`, Google body `deviceId?` -- Wide Bag (3건)
- `JwtPayload` DU 분리:
  - `{ sub: string; role: 'daemon' }`
  - `{ sub: string; role: 'app'; deviceId: string | null }`
- `signAppToken`: `deviceId: string | null` (required)
- Google OAuth body: `deviceId: string | null` (required)

### #47 `IncomingMessage/OutgoingMessage` Wide Bag
- `RelayEnvelope`가 required+null로 변경되면서 자동 전파
- 추가 optional 필드들도 required+null로 변환:
  - `payload?: any` -> `payload: unknown`
  - `id?: string` -> `id: string | null`
  - `message?: string` -> `message: string | null`

### #48 `PushResult.ticketId?/error?` -- DU 미적용
- DU 분리:
  - `PushResultOk: { ok: true; ticketId: string }`
  - `PushResultFailed: { ok: false; error: string }`

### #49~#54 Registry 타입들 (6건)
- `UserRecord.passwordHash?: string` -> `passwordHash: string | null`
- `DeviceRecord.pushToken?: string` -> `pushToken: string | null`
- `SessionRecord.metadata?: Record<string, unknown>` -> `metadata: Record<string, unknown> | null`
- `CreateUserParams.passwordHash?: string` -> `passwordHash: string | null`
- `RegisterDeviceParams.pushToken?: string` -> `pushToken: string | null`
- `CreateSessionParams.metadata?: Record<string, unknown>` -> `metadata: Record<string, unknown> | null`

## 2. 완료 조건
- [ ] `routes/auth.ts`에서 `PairBody`, `JwtPayload`, `signAppToken`, Google body 위반 대상 `?:` 0건
- [ ] `routes/ws.ts`에서 `IncomingMessage`/`OutgoingMessage` 위반 대상 `?:` 0건
- [ ] `routes/push.ts`에서 `PushResult`가 `PushResultOk | PushResultFailed` DU
- [ ] `registry/registry-adapter.ts`에서 위반 대상 심볼 내 `?:` 0건
- [ ] `registry/pg-registry.ts`에서 구현체 시그니처 동기화
- [ ] relay 패키지 `tsc --noEmit` 통과
- [ ] relay 테스트 통과 (`tests/pg-registry.test.ts`)
- [ ] `PairBody` DU에서 `type` 필드로 daemon/app 구분 가능
- [ ] `JwtPayload` DU에서 `role` 필드로 daemon/app 구분 가능

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/relay/
├── src/
│   ├── routes/auth.ts                 # #43~#46: PairBody DU, JwtPayload DU, signAppToken, Google body
│   ├── routes/ws.ts                   # #47: IncomingMessage/OutgoingMessage required+null
│   ├── routes/push.ts                 # #48: PushResult DU
│   ├── registry/registry-adapter.ts   # #49~#54: Record/Params 타입 required+null
│   └── registry/pg-registry.ts        # registry-adapter 시그니처 동기화 (구현체)
└── tests/
    └── pg-registry.test.ts            # 레지스트리 타입 fixture 수정
```

### 의존성 분석

**upstream** (Step 01에서 확정):
- `RelayEnvelope` required+null (Step 01) -> `ws.ts`의 `IncomingMessage`가 `RelayEnvelope` 기반이므로 자동 전파

**downstream**:
- relay 타입은 대부분 내부 타입이므로 외부 cascade 없음
- `JwtPayload` 변경은 JWT 검증 로직에 영향 -- relay 내부에서 완결
- `PairBody` DU 변경은 `/auth/pair` 엔드포인트의 body 파싱에 영향 -- relay 내부에서 완결

### Side Effect 위험
- **PairBody DU**: `/auth/pair` 엔드포인트에서 body 파싱 시 `type` 필드 검증 로직 추가 필요. 기존 클라이언트(daemon/app)가 `type` 필드를 보내지 않으면 런타임 에러 -- daemon/app 코드에서 `type` 필드 전송 확인 필요
- **JwtPayload DU**: JWT 생성/검증 로직에서 `role`로 분기하는 코드가 이미 존재하므로 DU 적용이 자연스러움
- **Registry required+null**: PostgreSQL 쿼리에서 `NULL` 처리가 이미 되어 있으므로 위험도 낮음

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 다음: [Step 06: app 타입 정리](step-06-app.md)
