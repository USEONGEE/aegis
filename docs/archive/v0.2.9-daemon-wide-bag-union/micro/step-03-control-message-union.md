# Step 03: ControlMessage Discriminated Union 재정의

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음 (Step 01, 02와 독립적 -- 별도 파일)

---

## 1. 구현 내용 (design.md 기반)

design.md 6.3절 + 8절 Step 3 기반:

- `control-handler.ts`에서 기존 `ControlPayload` wide optional bag 인터페이스 제거
- `[key: string]: unknown` 인덱스 시그니처 제거
- `SignedApprovalFields` 공통 인터페이스 정의:
  - `requestId`, `signature`, `approverPubKey`, `chainId`, `accountIndex`, `signerId`, `targetHash`, `policyVersion`, `expiresAt`, `nonce`, `content` -- 11개 필드, 모두 필수
- `PolicyApprovalPayload extends SignedApprovalFields` 정의 (추가 필드: `policies`)
- `PairingConfirmPayload` 정의 (`signerId`, `identityPubKey`, `encryptionPubKey`, `pairingToken`, `sas`)
- `CancelMessagePayload` 정의 (`messageId`)
- `ControlMessage`를 type-discriminated union으로 재정의:
  - `{ type: 'policy_approval'; payload: PolicyApprovalPayload }`
  - `{ type: 'policy_reject'; payload: SignedApprovalFields }`
  - `{ type: 'device_revoke'; payload: SignedApprovalFields }`
  - `{ type: 'wallet_create'; payload: SignedApprovalFields }`
  - `{ type: 'wallet_delete'; payload: SignedApprovalFields }`
  - `{ type: 'pairing_confirm'; payload: PairingConfirmPayload }`
  - `{ type: 'cancel_message'; payload: CancelMessagePayload }`
- `toSignedApproval`의 파라미터를 `(payload: ControlPayload, type: string)` -> `(fields: SignedApprovalFields, type: SignedApproval['type'])`로 변경
- `handleControlMessage`의 switch 분기에서:
  - `payload` 접근을 variant별로 좁혀진 타입으로 변경
  - `toSignedApproval(payload, ...)` 호출을 `toSignedApproval(msg.payload, ...)` 형태로 변경 (payload가 이미 `SignedApprovalFields` 또는 그 확장)
  - `pairing_confirm` 분기에서 destructuring이 `PairingConfirmPayload`의 필드와 일치하도록 조정
  - `cancel_message` 분기에서 `payload.messageId`가 `CancelMessagePayload`에서 필수이므로 optional 체크 패턴 조정
- `ControlResult` 인터페이스는 현재 구조 유지 (범위 제외)

## 2. 완료 조건

- [ ] `rg '\[key: string\]' packages/daemon/src/control-handler.ts` 결과 0건 (F7)
- [ ] `rg 'interface SignedApprovalFields' packages/daemon/src/control-handler.ts` 결과 1건 (F9)
- [ ] `rg 'targetHash' packages/daemon/src/control-handler.ts` 결과 1건 이상 -- SignedApprovalFields에 명시 (F10a)
- [ ] `rg 'policyVersion' packages/daemon/src/control-handler.ts` 결과 1건 이상 -- SignedApprovalFields에 명시 (F10b)
- [ ] `rg 'expiresAt' packages/daemon/src/control-handler.ts` 결과 1건 이상 -- SignedApprovalFields에 명시 (F10c)
- [ ] `rg 'nonce' packages/daemon/src/control-handler.ts` 결과 1건 이상 -- SignedApprovalFields에 명시 (F10d)
- [ ] `rg 'toSignedApproval.*SignedApprovalFields' packages/daemon/src/control-handler.ts` 결과 1건 (F11)
- [ ] `rg "type: 'policy_approval'" packages/daemon/src/control-handler.ts` 결과 1건 (F8a)
- [ ] `rg "type: 'policy_reject'" packages/daemon/src/control-handler.ts` 결과 1건 (F8b)
- [ ] `rg "type: 'device_revoke'" packages/daemon/src/control-handler.ts` 결과 1건 (F8c)
- [ ] `rg "type: 'wallet_create'" packages/daemon/src/control-handler.ts` 결과 1건 (F8d)
- [ ] `rg "type: 'wallet_delete'" packages/daemon/src/control-handler.ts` 결과 1건 (F8e)
- [ ] `rg "type: 'pairing_confirm'" packages/daemon/src/control-handler.ts` 결과 1건 (F8f)
- [ ] `rg "type: 'cancel_message'" packages/daemon/src/control-handler.ts` 결과 1건 (F8g)
- [ ] `rg 'PolicyApprovalPayload' packages/daemon/src/control-handler.ts` 결과 1건 (F12)
- [ ] `rg 'PairingConfirmPayload' packages/daemon/src/control-handler.ts` 결과 1건 (F12)
- [ ] `rg 'CancelMessagePayload' packages/daemon/src/control-handler.ts` 결과 1건 (F12)
- [ ] `rg 'PolicyApprovalPayload extends' packages/daemon/src/control-handler.ts` 결과 1건 (E2)
- [ ] `ControlResult` 인터페이스 정의 블록에 변경 없음 (F13)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 이전 baseline 대비 새 에러 미발생 (N1)

## 3. 롤백 방법
- 롤백 절차: `git revert` 단일 커밋. `ControlPayload`/`ControlMessage` 원래 인터페이스 복원, `toSignedApproval` 원래 시그니처 복원.
- 영향 범위: `control-handler.ts`만 영향. Step 04(index.ts)가 아직 진행 전이면 독립적 롤백 가능.

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── control-handler.ts  # 수정 - ControlPayload 제거, SignedApprovalFields/PolicyApprovalPayload/PairingConfirmPayload/CancelMessagePayload 정의, ControlMessage union 재정의, toSignedApproval 시그니처 변경, switch 분기 payload 접근 패턴 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| control-handler.ts | 직접 수정 | 타입 재정의 + 함수 시그니처 변경 + switch 분기 내 payload 접근 변경 |
| index.ts | 간접 영향 | `handleControlMessage(payload, ...)` 호출에서 `payload`의 타입이 달라짐. Step 04에서 처리 |
| @wdk-app/guarded-wdk | 의존 (읽기) | `SignedApproval['type']` 타입을 참조. 변경 불필요 |

### Side Effect 위험
- 위험 1: `handleControlMessage` 내 `const { type, payload } = msg` destructuring 후, `switch (type)` 분기에서 TypeScript가 `payload`를 자동으로 좁히지 않을 수 있음 (destructured 변수는 narrowing 대상이 아님). **대응**: `switch (msg.type)` + `msg.payload`로 접근하거나, 각 case에서 `const payload = msg.payload`로 재선언.
- 위험 2: `toSignedApproval` 시그니처 변경으로 인해 5개 호출부(policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete)에서 인자 전달 방식 변경 필요. **대응**: 각 case에서 `msg.payload`가 이미 `SignedApprovalFields` 또는 확장이므로 직접 전달.
- 위험 3: `pairing_confirm` 분기에서 기존에 `payload.identityPubKey`를 optional로 체크하던 로직이 `PairingConfirmPayload`의 필수 필드와 충돌. **대응**: 필드 체크 로직을 wire parse 단계(as cast)에서 처리하고, handleControlMessage 내부에서는 타입이 보장된 것으로 가정. 기존 런타임 체크(`if (!identityPubKey)`)는 방어적으로 유지 가능 -- 타입과 무관한 런타임 안전장치.

### 참고할 기존 패턴
- `control-handler.ts:12-31`: 현재 `ControlMessage`, `ControlPayload` (재정의 대상)
- `control-handler.ts:62-76`: 현재 `toSignedApproval` (시그니처 변경 대상)
- `control-handler.ts:108-330`: `handleControlMessage` switch 분기 (payload 접근 패턴 변경 대상)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| control-handler.ts | ControlPayload 제거, 7개 variant 정의, SignedApprovalFields, toSignedApproval 변경, switch 분기 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ControlPayload wide bag 제거 | ✅ control-handler.ts | OK |
| [key: string]: unknown 제거 | ✅ control-handler.ts | OK |
| SignedApprovalFields 인터페이스 | ✅ control-handler.ts | OK |
| PolicyApprovalPayload extends SignedApprovalFields | ✅ control-handler.ts | OK |
| PairingConfirmPayload | ✅ control-handler.ts | OK |
| CancelMessagePayload | ✅ control-handler.ts | OK |
| ControlMessage union (7 variants) | ✅ control-handler.ts | OK |
| toSignedApproval 시그니처 변경 | ✅ control-handler.ts | OK |
| switch 분기 payload 접근 패턴 변경 | ✅ control-handler.ts | OK |
| ControlResult 변경 없음 확인 | ✅ control-handler.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 04: index.ts 호출부 수정](step-04-index-callsite.md)
