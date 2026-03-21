# Step 05: 테스트 업데이트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01, 02, 03 (타입 정의가 완료되어야 테스트에서 import 가능)

---

## 1. 구현 내용 (design.md 기반)

design.md 8절 Step 5 + 10절 기반:

### tool-surface.test.ts
- `ToolResult` import를 `AnyToolResult`로 변경 (또는 per-tool result 타입 직접 import)
- 각 테스트의 result assertion이 per-tool result 필드와 일치하는지 검증
- 대부분의 assertion이 이미 올바른 필드를 확인하므로 변경 소량 예상
- `ToolResult` 타입으로 캐스팅하던 부분을 구체적인 per-tool result 타입으로 변경

### control-handler.test.ts
- `ControlMessage` 리터럴의 타입이 union variant와 일치하도록 수정
- 각 테스트에서 생성하는 `ControlMessage` 리터럴의 `payload`가 해당 variant의 필수 필드를 모두 포함하도록 보완:
  - 1-5번(policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete): `SignedApprovalFields`의 11개 필수 필드(requestId, signature, approverPubKey, chainId, accountIndex, signerId, targetHash, policyVersion, expiresAt, nonce, content) 모두 포함
  - policy_approval: 추가로 `policies` 필드 포함
  - 6번(pairing_confirm): `PairingConfirmPayload`의 5개 필수 필드 포함
  - 7번(cancel_message): `CancelMessagePayload`의 `messageId` 필수 필드 포함
- 기존에 `ControlPayload`를 직접 참조하던 import가 있으면 제거
- 테스트 헬퍼/팩토리 함수 도입 검토 (기본값으로 `SignedApprovalFields` 채우기)

## 2. 완료 조건

- [ ] `rg 'import.*ToolResult.*tool-surface' packages/daemon/tests/tool-surface.test.ts` 결과 0건 (ToolResult import 제거) 또는 AnyToolResult로 교체 확인
- [ ] `rg 'import.*ControlPayload' packages/daemon/tests/control-handler.test.ts` 결과 0건 (ControlPayload import 제거 -- 타입 자체가 제거됨)
- [ ] control-handler.test.ts의 모든 `ControlMessage` 리터럴에서 variant별 필수 필드가 포함됨:
  - [ ] policy_approval 리터럴에 `targetHash`, `policyVersion`, `expiresAt`, `nonce`, `content`, `policies` 포함
  - [ ] policy_reject/device_revoke/wallet_create/wallet_delete 리터럴에 `targetHash`, `policyVersion`, `expiresAt`, `nonce`, `content` 포함
  - [ ] pairing_confirm 리터럴에 `signerId`, `identityPubKey`, `encryptionPubKey`, `pairingToken`, `sas` 포함
  - [ ] cancel_message 리터럴에 `messageId` 포함
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 이전 baseline 대비 새 에러 미발생 (N1)
- [ ] 기존 테스트 전량 통과: `npm test --workspace=packages/daemon` 성공 (design.md 10절)

## 3. 롤백 방법
- 롤백 절차: `git revert` 단일 커밋. 테스트 파일 원래 상태 복원.
- 영향 범위: 테스트 파일 2개만 영향. 소스 코드 무관.

---

## Scope

### 수정 대상 파일
```
packages/daemon/tests/
├── tool-surface.test.ts       # 수정 - ToolResult import 변경, assertion 검증
└── control-handler.test.ts    # 수정 - ControlMessage 리터럴 payload 필드 보완, ControlPayload import 제거, 헬퍼 함수 도입
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| tool-surface.test.ts | 직접 수정 | import 변경 + assertion 검증 |
| control-handler.test.ts | 직접 수정 | payload 필드 보완 + import 정리 + 헬퍼 함수 |
| tool-surface.ts | 의존 (읽기) | Step 01에서 정의한 AnyToolResult / per-tool result 타입 |
| control-handler.ts | 의존 (읽기) | Step 03에서 정의한 ControlMessage / SignedApprovalFields 타입 |

### Side Effect 위험
- 위험 1: 기존 테스트가 의도적으로 불완전한 payload를 사용하여 특정 경로만 테스트하고 있을 수 있음 (예: policy_reject에서 targetHash 없이 호출). **대응**: 필수 필드를 기본값으로 채우는 팩토리 함수를 도입하여 기존 테스트의 의도를 보존하면서 타입 만족. 기본값은 빈 문자열/0 등.
- 위험 2: 테스트에서 `as any` 또는 `as ControlMessage` 캐스트를 사용하여 타입 체크를 우회하고 있을 수 있음. **대응**: 캐스트 제거하고 정확한 타입의 리터럴로 교체.

### 참고할 기존 패턴
- `tests/tool-surface.test.ts`: 현재 테스트에서 ToolResult 사용 패턴
- `tests/control-handler.test.ts`: 현재 테스트에서 ControlMessage 리터럴 생성 패턴

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-surface.test.ts | ToolResult -> AnyToolResult import, assertion 검증 | ✅ OK |
| control-handler.test.ts | payload 필드 보완, import 정리, 헬퍼 함수 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ToolResult import 변경 | ✅ tool-surface.test.ts | OK |
| assertion 필드 검증 | ✅ tool-surface.test.ts | OK |
| ControlMessage 리터럴 payload 보완 | ✅ control-handler.test.ts | OK |
| ControlPayload import 제거 | ✅ control-handler.test.ts | OK |
| 테스트 헬퍼 함수 도입 | ✅ control-handler.test.ts | OK |
| 기존 테스트 전량 통과 확인 | ✅ 두 테스트 파일 모두 | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 이전: [Step 04: index.ts 호출부 수정](step-04-index-callsite.md)
