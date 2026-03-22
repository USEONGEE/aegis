# Step 01: canonical + protocol Leaf 타입 확정

## 메타데이터
- **난이도**: 🔴 높음 (ControlResult DU 분리, cascade 최대)
- **롤백 가능**: ✅
- **선행 조건**: 없음 (leaf 패키지)
- **위반 ID**: #1~#13 (총 13건)
- **DoD 항목**: F1, F2, F3, N1, E1, E4, E6

---

## 1. 구현 내용 (design.md 기반)

### Wave 1: canonical (1건)

#### #1 `IntentInput.value?` -- Default 대신 Optional
- `value?: string | number | null` -> `value: string` (required)
- `normalizeValue()` 내부의 `undefined` 분기 제거
- 호출부에서 `value` 값을 명시적으로 전달 (이미 대부분 전달 중)

### Wave 2: protocol (12건)

#### #2~#7 `ControlResult` Wide Bag (6건)
- 단일 interface를 **8-variant discriminated union**으로 분리:
  - `ControlResultApprovalOk`: 승인 계열 성공 (tx_approval, policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete)
  - `ControlResultApprovalError`: 승인 계열 실패
  - `ControlResultCancelQueuedOk`: cancel_queued 성공
  - `ControlResultCancelQueuedError`: cancel_queued 실패
  - `ControlResultCancelActiveOk`: cancel_active 성공
  - `ControlResultCancelActiveError`: cancel_active 실패
  - `ControlResultCancelError`: cancel 시도 중 catch된 에러
  - `ControlResultGenericError`: malformed message, unknown type
- optional 필드 6개 (`type?`, `requestId?`, `messageId?`, `error?`, `reason?`, `wasProcessing?`) 전부 제거
- 각 variant에서 필요한 필드만 required로 선언

#### #8~#13 `RelayEnvelope` Wide Bag (6건)
- DU 분리 대신 **보수적 접근: required + null 패턴** 적용 (DU는 v0.4.1로 연기)
- `payload?: unknown` -> `payload: unknown`
- `encrypted?: boolean` -> `encrypted: boolean`
- `sessionId?: string` -> `sessionId: string | null`
- `userId?: string` -> `userId: string | null`
- `daemonId?: string` -> `daemonId: string | null`
- `userIds?: string[]` -> `userIds: string[] | null`

## 2. 완료 조건
- [ ] `packages/canonical/src/index.ts`에서 `IntentInput.value`가 `string` (required, non-optional)
- [ ] `normalizeValue()` 내 `undefined` 분기 제거
- [ ] `packages/protocol/src/control.ts`에서 `ControlResult`가 8-variant DU
- [ ] `ControlResult` 관련 `?:` 0건
- [ ] `packages/protocol/src/relay.ts`에서 `RelayEnvelope` 관련 `?:` 0건
- [ ] `RelayEnvelope`의 6개 필드 모두 required (`T | null` 또는 `T`)
- [ ] `packages/protocol/src/index.ts`에서 신규 DU variant들 export 추가
- [ ] canonical 패키지 `tsc --noEmit` 통과
- [ ] protocol 패키지 `tsc --noEmit` 통과
- [ ] canonical 테스트 통과 (`canonical/tests/canonical.test.ts`)
- [ ] 기존 정당한 optional (QueryOpts, config 등) 변경 없음

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/canonical/
├── src/index.ts                    # #1: IntentInput.value required 변환
└── tests/canonical.test.ts         # IntentInput fixture 수정

packages/protocol/
├── src/control.ts                  # #2~#7: ControlResult DU 분리
├── src/relay.ts                    # #8~#13: RelayEnvelope required+null
└── src/index.ts                    # 신규 DU variant export 추가
```

### 의존성 분석

**ControlResult DU cascade** (downstream -- 이 Step에서는 타입 정의만, 호출부는 후속 Step에서 수정):
- `packages/daemon/src/control-handler.ts`: 각 case에서 ControlResult 리터럴 반환 -- Step 04에서 수정
- `packages/daemon/src/index.ts`: `relayClient.send('control', result)` -- 타입 변경 없이 전달
- `packages/daemon/tests/control-handler.test.ts`: assertion 수정 -- Step 04에서 수정

**RelayEnvelope cascade** (downstream):
- `packages/daemon/src/relay-client.ts`: envelope 구성 시 null 명시 -- Step 04에서 수정
- `packages/relay/src/routes/ws.ts`: IncomingMessage extends 변경 -- Step 05에서 수정
- `packages/app/src/core/relay/RelayClient.ts`: envelope 수신 -- Step 06에서 수정

### Side Effect 위험
- **ControlResult DU**: cascade가 가장 큰 변경. daemon의 control-handler.ts에서 모든 반환 리터럴이 DU variant와 일치해야 함. Step 04에서 동시 수정.
- **RelayEnvelope required+null**: wire protocol 변경이므로 모든 envelope 구성 코드에서 null 명시 필요. 누락 시 tsc에서 컴파일 에러로 즉시 감지.
- 이 Step은 **타입 정의 패키지**(leaf)이므로 단독으로는 컴파일이 통과하지만, downstream 패키지는 Step 02~06에서 순차 수정 필요.

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 다음: [Step 02: guarded-wdk 내부 타입](step-02-guarded-wdk.md)
