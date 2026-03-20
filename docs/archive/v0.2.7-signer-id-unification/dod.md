# DoD (Definition of Done) - v0.2.7

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `SignedApproval.signerId` 필드 삭제 | approval-store.ts에서 SignedApproval에 signerId 없음 |
| F2 | `HistoryEntry.signerId` 필드 삭제 | approval-store.ts에서 HistoryEntry에 signerId 없음 |
| F3 | `StoredSigner.signerId` 필드 삭제, publicKey가 PK | approval-store.ts에서 StoredSigner 확인 |
| F4 | `ApprovalStore` signer 메서드: signerId → publicKey 파라미터 | saveSigner(publicKey, name?), getSigner(publicKey), revokeSigner(publicKey), isSignerRevoked(publicKey) 확인 |
| F5 | nonce 메서드: `(approver, signerId)` → `(approver)` 단일키 | getLastNonce(approver), updateNonce(approver, nonce) 확인 |
| F6 | approval-verifier: signerId 참조 0건, approver로 폐기체크 | approval-verifier.ts에서 signerId 검색 0건 |
| F7 | signed-approval-broker: signerId → approver | signed-approval-broker.ts에서 signerId 검색 0건 (문자열 리터럴 제외) |
| F8 | Json/SqliteApprovalStore: signers/nonces 스키마 변경 | store 테스트에서 round-trip 확인 |
| F9 | daemon control-handler: pairing_confirm에서 signerId → publicKey | control-handler.ts에서 saveSigner(identityPubKey, ...) 호출 확인 |
| F10 | daemon admin-server: signer 목록에서 publicKey 기준 | admin-server.ts에서 signerId 참조 0건 |
| F11 | App SignedApprovalBuilder: signerId 필드/setter 삭제 | SignedApprovalBuilder.ts에서 signerId 검색 0건 |
| F12 | App types.ts: SignedApprovalPayload.signerId 삭제 | types.ts에서 signerId 검색 0건 |
| F13 | App SettingsScreen: signerId → publicKey, name fallback | SettingsScreen.tsx에서 signerId 검색 0건 |
| F14 | App PairingService: signerId → publicKey | PairingService.ts에서 signerId 검색 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk 전체 테스트 통과 | npm test |
| N2 | daemon 전체 테스트 통과 | npm test |
| N3 | packages/ src/에서 `signerId` 잔존 0건 | grep (docs/ 제외) |
| N4 | clean install로 fresh store 정상 동작 | store 테스트에서 init → signer CRUD 동작 확인 |
| N5 | App 변경 확인: SignedApprovalBuilder, PairingService, SettingsScreen에서 signerId 0건 | grep 검증 + SettingsScreen name fallback 코드 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | device_revoke: targetHash = SHA-256(폐기 대상 signer의 publicKey) | App(SignedApprovalBuilder)과 daemon(control-handler) 양쪽이 동일한 해시 생성 | control-handler.test.ts + App 코드 확인 |
| E2 | signer name이 null일 때 UI 표시 | 축약 publicKey (`pk[:8]...pk[-4:]`) | App SettingsScreen 코드 확인 |
| E3 | nonce 단일키 전환 후 replay 방지 | approver 기준 nonce 증가/거부 동작 | approval-broker.test.ts |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 |
|----------|---------|
| SignedApproval signerId 제거 | F1, F6, F7, F11, F12 |
| StoredSigner publicKey PK | F3, F4, F8, F9, F10 |
| nonce 단일키 | F5, E3 |
| HistoryEntry signerId 제거 | F2 |
| App 정리 | F11, F12, F13, F14, E2 |
