# Step 07: Signer Status DU

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 02 (StoredSigner.name이 먼저 non-null이어야 함)

## 1. 구현 내용 (design.md 기반)
- `SignerStatus` DU: `{ kind: 'active' } | { kind: 'revoked'; revokedAt: number }`
- `StoredSigner.revokedAt: number | null` → `StoredSigner.status: SignerStatus`
- 소비자 업데이트: `d.revokedAt === null` → `d.status.kind === 'active'`
- Store 구현: DB `revoked_at` null → `{ kind: 'active' }` 변환

## 2. 완료 조건
- [ ] `rg 'revokedAt.*null' packages/guarded-wdk/src/wdk-store.ts` StoredSigner 관련 0건
- [ ] `SignerStatus` DU 존재
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>`

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── wdk-store.ts           # StoredSigner 타입, SignerStatus DU 정의
├── sqlite-wdk-store.ts    # DB row → SignerStatus 변환
├── json-wdk-store.ts      # 동일
└── signed-approval-broker.ts  # revokedAt 체크 → status.kind 체크

packages/daemon/src/
├── wdk-host.ts            # signer 필터링 로직
└── admin-server.ts        # signer list API
```

### Side Effect 위험
- Signer revoke flow — 테스트로 검증

## FP/FN 검증

### 검증 통과: ✅

---

→ 다음: [Step 08: App ApprovalRequest DU](step-08-app-approval-du.md)
