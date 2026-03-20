# Step 03: Store 구현체

## 메타데이터
- **소유 DoD**: F8, N4
- **수정 파일**: `packages/guarded-wdk/src/json-approval-store.ts`, `packages/guarded-wdk/src/sqlite-approval-store.ts`
- **의존성**: Step 01
- **롤백**: 단일 커밋 revert + clean install

## Scope
- json-approval-store: signers.json 키 변경 (signerId→publicKey), nonces.json 키 변경, history signerId 제거
- sqlite-approval-store: signers 테이블 DDL 변경 (signer_id→public_key PK), nonces DDL 변경, INSERT/SELECT/UPDATE 쿼리 변경

## 구현 내용
1. Json signers: `signers[signerId] = { signer_id, public_key, ... }` → `signers[publicKey] = { public_key, ... }`
2. Json nonces: `"${approver}:${signerId}"` → `"${approver}"`
3. Json history: `signer_id: entry.signerId` → 제거
4. Sqlite signers: `CREATE TABLE signers (signer_id TEXT PK, ...)` → `CREATE TABLE signers (public_key TEXT PK, ...)`
5. Sqlite nonces: `PRIMARY KEY (approver, signer_id)` → `PRIMARY KEY (approver)`
6. Sqlite history: `signer_id` 컬럼 제거

## 완료 조건
- [ ] F8: store 테스트에서 signer round-trip 통과 (saveSigner→getSigner→revokeSigner)
- [ ] N4: fresh init 후 signer CRUD 동작

## FP/FN
- **FP**: 없음
- **FN**: store-types.ts row 타입은 Step 01에서 처리됨.
