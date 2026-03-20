# DoD (Definition of Done) - v0.2.2

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `MiddlewareConfig.policiesRef` 제거, `policyResolver: (chainId: number) => Promise<Policy[]>` 추가 | guarded-middleware.ts에서 `policiesRef` 검색 0건 + `policyResolver` 존재 확인 |
| F2 | `MiddlewareConfig.accountIndexRef` 제거 | guarded-middleware.ts에서 `accountIndexRef` 검색 0건 |
| F3 | `ChainPolicies` 타입 삭제 | guarded-middleware.ts + index.ts에서 `ChainPolicies` 검색 0건 |
| F4 | `ChainPolicyConfig` 타입 삭제 | guarded-middleware.ts + index.ts에서 `ChainPolicyConfig` 검색 0건 |
| F5 | `GuardedWDKConfig.policies` 필드 삭제 | guarded-wdk-factory.ts에서 config `policies` 필드 부재 확인 |
| F6 | `GuardedWDKConfig.approvalStore` 필수화 — 없으면 throw | factory.test.ts에서 approvalStore 미전달 시 에러 테스트 |
| F7 | `GuardedWDKFacade.updatePolicies` 메서드 삭제 | guarded-wdk-factory.ts에서 `updatePolicies` 검색 0건 |
| F8 | `policiesStore` 메모리 캐시 삭제 | guarded-wdk-factory.ts에서 `policiesStore` 검색 0건 |
| F9 | daemon `swapPoliciesForWallet` 삭제 | tool-surface.ts에서 `swapPoliciesForWallet` 검색 0건 |
| F10 | daemon `control-handler`에서 `wdk.updatePolicies` → `store.savePolicy` 전환 | control-handler.ts에서 `updatePolicies` 검색 0건 + `savePolicy` 호출 존재 |
| F11 | daemon `wdk-host.ts`에서 부팅 시 정책 복원 로직 삭제 | wdk-host.ts에서 `restoredPolicies` 검색 0건 |
| F12 | `WDKInstance.updatePolicies` 메서드 삭제 | wdk-host.ts에서 `updatePolicies` 메서드 정의 0건 |
| F13 | `evaluatePolicy` 함수가 `Policy[]`를 직접 받음 | guarded-middleware.ts에서 `evaluatePolicy` 시그니처 확인: 첫 번째 파라미터가 `Policy[]` |
| F14 | `handleControlMessage`의 `approvalStore` 파라미터가 writer interface로 확장 (`savePolicy` 포함) | control-handler.ts의 `ApprovalStoreWriter` 또는 동등 타입에 `savePolicy` 메서드 존재 |
| F15 | policyResolver가 accountIndex에 따라 지갑별 정책을 분리 조회 | (1) factory.test.ts: `getAccount('1', 0)` / `getAccount('1', 1)` 호출로 currentAccountIndex 전환 확인 + `getAccountByPath` BIP-44 파싱 확인. (2) integration.test.ts: middleware 레벨에서 activeAccountIndex 0(AUTO)/1(REJECT) 전환 후 동일 tx에 대해 각각 성공/거부 확인. |
| F16 | policyResolver 반환값에 대해 `validatePolicies` 호출 | guarded-wdk-factory.ts의 resolver 내부에서 `validatePolicies` 호출 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk typecheck: master baseline 대비 `error TS` diagnostics count 비증가 | baseline(60ca1ef) vs 변경 후 `grep -c 'error TS'` 비교 |
| N2 | daemon build: master baseline 대비 `error TS` diagnostics count 비증가 | 동일 방식 |
| N3 | guarded-wdk 전체 테스트 통과 | `cd packages/guarded-wdk && npm test` 종료코드 0 |
| N4 | daemon 전체 테스트 통과 | `cd packages/daemon && npm test` 종료코드 0 |
| N5 | packages/ src/에서 `ChainPolicies`/`ChainPolicyConfig`/`policiesStore`/`swapPoliciesForWallet` 잔존 0건 | `grep -r` 결과 0건 (docs/ 제외) |
| N6 | guide 문서 업데이트 | packages/guarded-wdk/docs/guide/README.md에서 config.policies 예시 제거/수정 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | store에 해당 accountIndex+chainId 정책이 없는 경우 | policyResolver가 `[]` 반환 → 정책 없음 = 기본 거부 | integration.test.ts에서 빈 정책 시나리오 테스트 |
| E2 | approvalStore 없이 createGuardedWDK 호출 | 즉시 에러 throw (No Fallback) | factory.test.ts에서 에러 테스트 |
| E3 | policy_approval 후 store.savePolicy 호출 | policies + signature: {} 로 저장 | control-handler.test.ts에서 savePolicy 호출 검증 |
| E4 | accountIndex 0과 1에 다른 정책이 저장된 상태에서 지갑 전환 | activeAccountIndex 전환 후 동일 tx가 다른 정책으로 평가됨 (0=AUTO, 1=REJECT). swap 없이 resolver가 직접 분리. | integration.test.ts "wallet-specific policy" 테스트 (F15와 동일) |
| E5 | policy_approval에서 broker.submitApproval 실패 시 | savePolicy 호출되지 않음 (기존 동작 유지) | control-handler.test.ts에서 broker 에러 시 savePolicy 미호출 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| middleware가 policyResolver로 직접 조회 | F1, F2, F13, F15, F16, E4 |
| ChainPolicies/ChainPolicyConfig 삭제 | F3, F4, N5 |
| policiesStore 캐시 삭제 | F5, F7, F8, N5 |
| swapPoliciesForWallet 삭제 | F9, N5 |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 |
|----------|---------|
| policyResolver(chainId) 시그니처 | F1, F13 |
| accountIndex closure 흡수 | F2, F15, E4 |
| config.policies 삭제 | F5 |
| approvalStore 필수 | F6, E2 |
| updatePolicies 삭제 | F7, F12 |
| control-handler writer interface | F10, F14, E3, E5 |
| validatePolicies 유지 | F16 |
| wdk-host 정책 복원 삭제 | F11 |
