# Step 02: Store 구현체 수정

## 메타데이터
- **소유 DoD**: F4, F5, N6
- **수정 파일**: `packages/guarded-wdk/src/json-approval-store.ts`, `packages/guarded-wdk/src/sqlite-approval-store.ts`
- **확인 파일 (변경 없음)**: `packages/guarded-wdk/src/store-types.ts` (PolicyRow 유지 확인)
- **의존성**: Step 01

## 구현 내용
1. JsonApprovalStore.loadPolicy: `policiesJson: row.policies_json` → `policies: JSON.parse(row.policies_json) as unknown[]`, `signatureJson: row.signature_json` → `signature: JSON.parse(row.signature_json) as Record<string, unknown>`
2. SqliteApprovalStore.loadPolicy: 동일 변경
3. savePolicy: 변경 없음 (이미 JSON.stringify 사용)
4. store-types.ts: 변경 없음 확인 (PolicyRow의 policies_json/signature_json 유지)

## 완료 조건
- [ ] F4: JsonApprovalStore.loadPolicy가 policies/signature 파싱된 형태 반환
- [ ] F5: SqliteApprovalStore.loadPolicy가 policies/signature 파싱된 형태 반환
- [ ] N6: store-types.ts PolicyRow 필드, SQLite CREATE TABLE, JSON savePolicy 키 모두 policies_json/signature_json 유지

## FP/FN 검증
- **FP (과잉)**: 없음. loadPolicy만 수정, savePolicy/다른 메서드는 영향 없음.
- **FN (누락)**: store-types.ts를 변경하지 않는 것이 N6의 요구. 변경 여부만 확인하면 됨.
