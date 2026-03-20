# Step 06: 테스트 + 최종 검증

## 메타데이터
- **소유 DoD**: N1, N2, N3, N5, E1, E2, E3
- **수정 파일**: `guarded-wdk/tests/approval-broker.test.ts`, `guarded-wdk/tests/json-approval-store.test.ts`, `guarded-wdk/tests/sqlite-approval-store.test.ts`, `guarded-wdk/tests/factory.test.ts`, `guarded-wdk/tests/integration.test.ts`, `daemon/tests/control-handler.test.ts`, `app/tests/PairingService.test.js`
- **의존성**: Step 01-05
- **롤백**: 단일 커밋 revert

## Scope
- 모든 테스트 파일에서 signerId 참조 제거/변경
- signer 관련 mock 객체 업데이트
- nonce 테스트에서 복합키 → 단일키

## 구현 내용
1. approval-broker.test.ts: mock SignedApproval에서 signerId 제거, mock store 메서드 시그니처 변경
2. json/sqlite-approval-store.test.ts: signer CRUD 테스트에서 signerId → publicKey, history에서 signerId 제거
3. factory.test.ts: mock store 시그니처 변경
4. integration.test.ts: mock store 시그니처 변경
5. control-handler.test.ts: pairing signerId→publicKey, device_revoke SHA-256(publicKey)
6. PairingService.test.js: signerId → publicKey

## 최종 검증
- [ ] N1: guarded-wdk 테스트 통과
- [ ] N2: daemon 테스트 통과
- [ ] N3: `grep -r 'signerId' packages/*/src/` → 0건 (docs 제외)
- [ ] N5: `grep -r 'signerId' packages/app/src/` → 0건
- [ ] E1: device_revoke targetHash = SHA-256(폐기 대상 publicKey) — control-handler.test.ts
- [ ] E2: SettingsScreen name fallback 코드 확인
- [ ] E3: nonce 단일키 replay 방지 — approval-broker.test.ts

## FP/FN
- **FP**: 없음
- **FN**: N3 grep으로 전체 검증.
