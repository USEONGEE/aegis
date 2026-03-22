# Step 06: app 타입 정리

## 메타데이터
- **난이도**: 🟡 보통 (대부분 required+null, 보안 필드 3건)
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (RelayEnvelope required+null 확정)
- **위반 ID**: #55~#64 (총 10건)
- **DoD 항목**: F16, F17, F18, F19, F20, N1, E4, E5, E7

---

## 1. 구현 내용 (design.md 기반)

### #55~#56 `Policy.constraints?/description?` -- Required+null (2건)
- `constraints?: Record<string, unknown>` -> `constraints: Record<string, unknown> | null`
- `description?: string` -> `description: string | null`

### #57~#58 `ActivityEvent.chainId?/details?` -- Wide Bag / Required+null (2건)
- `chainId?: number` -> `chainId: number | null`
- `details?: Record<string, unknown>` -> `details: Record<string, unknown> | null`

### #59~#60 `forTx.policyVersion?` / `build.policyVersion?` -- 보안 필드 (2건)
- `policyVersion?: number` -> `policyVersion: number` (required)
- 보안 필드이므로 default 0 대신 호출부에서 명시적으로 전달
- 호출부에서 policyVersion 누락 시 tsc 컴파일 에러로 즉시 감지

### #61 `EncryptedMessage.ephemeralPubKey?` -- DU 미적용 (dead field)
- `ephemeralPubKey?: string` 필드 제거
- 실제로 이 필드를 사용하는 코드가 없음 (dead field)
- key exchange 시 별도 타입이 필요하면 그때 추가

### #62 `RelayMessage.sessionId?` -- Wide Bag
- `sessionId?: string` -> `sessionId: string | null`

### #63 `ControlEnvelope.messageId?/timestamp?` -- Required+null (2건)
- `messageId?: string` -> `messageId: string` (required, non-null)
- `timestamp?: number` -> `timestamp: number` (required, non-null)
- `buildEnvelope()` 내에서 항상 생성되는 값이므로 null 불필요
- `buildEnvelope()` 내 spread 순서 수정: `extras`가 `messageId`/`timestamp`를 덮어쓰지 않도록

### #64 `connect.authToken?` -- 보안 필드
- `authToken?: string` -> `authToken: string` (required)
- 인증 없는 연결은 존재하지 않아야 함
- 호출부에서 authToken을 명시적으로 전달

## 2. 완료 조건
- [ ] `stores/usePolicyStore.ts`에서 `Policy` 위반 대상 `?:` 0건
- [ ] `stores/useActivityStore.ts`에서 `ActivityEvent` 위반 대상 `?:` 0건
- [ ] `core/approval/SignedApprovalBuilder.ts`에서 `policyVersion?` 0건
- [ ] `core/crypto/E2ECrypto.ts`에서 `ephemeralPubKey` 필드 완전 제거
- [ ] `core/relay/RelayClient.ts`에서 `RelayMessage`, `ControlEnvelope` 위반 대상 `?:` 0건
- [ ] `core/relay/RelayClient.ts`에서 `connect` 함수의 `authToken?` 0건
- [ ] `buildEnvelope()` 내 spread 순서가 `messageId`/`timestamp` 덮어쓰기 방지
- [ ] app 패키지 `tsc --noEmit` 통과
- [ ] `E2ECrypto.test.js`에서 `ephemeralPubKey` 관련 fixture 수정
- [ ] 보안 필드 3건 (`policyVersion` x2, `authToken`) 모두 required 확인

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/
│   ├── stores/usePolicyStore.ts              # #55~#56: Policy required+null
│   ├── stores/useActivityStore.ts            # #57~#58: ActivityEvent required+null
│   ├── core/approval/SignedApprovalBuilder.ts # #59~#60: policyVersion required (보안 필드)
│   ├── core/crypto/E2ECrypto.ts              # #61: ephemeralPubKey 필드 제거
│   ├── core/relay/RelayClient.ts             # #62~#64: RelayMessage, ControlEnvelope required, authToken required (보안 필드)
│   └── domains/settings/screens/SettingsScreen.tsx  # connect() 호출부 authToken 명시 (있을 경우)
└── tests/
    └── E2ECrypto.test.js                     # EncryptedMessage fixture 수정
```

### 의존성 분석

**upstream** (Step 01에서 확정):
- `RelayEnvelope` required+null (Step 01) -> `RelayClient.ts` 내부의 envelope 수신 코드에 영향

**downstream**:
- app은 의존 그래프의 끝단 (root)이므로 downstream cascade 없음
- 모든 변경이 app 내부에서 완결

### Side Effect 위험
- **policyVersion required (보안 필드)**: `forTx()`, `build()` 호출부에서 policyVersion을 명시적으로 전달해야 함. 누락 시 tsc 컴파일 에러. 승인 흐름의 핵심이므로 정확한 값 전달 검증 필요.
- **authToken required (보안 필드)**: `connect()` 호출부에서 authToken을 반드시 전달. 인증 토큰이 없는 상태에서 connect를 시도하면 컴파일 에러로 방지.
- **ephemeralPubKey 제거**: dead field이므로 제거해도 런타임 영향 없음. 단, `E2ECrypto.test.js`에서 이 필드를 포함하는 테스트가 있을 수 있음.
- **buildEnvelope spread 순서**: 기존 코드에서 `...extras`가 기본값을 덮어쓸 수 있는 잠재적 버그가 있으므로, 이번 수정에서 spread 순서를 명확히 하여 버그도 함께 수정.

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 이전: [Step 05: relay 타입 정리](step-05-relay.md) | [전체 현황](README.md)
