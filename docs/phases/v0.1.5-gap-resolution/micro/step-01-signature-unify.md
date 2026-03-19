# Step 01: 서명 방식 통일 (Gap 1)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `SignedApprovalBuilder.ts`에서 서명 전 SHA-256 해시 단계 추가
- 현재: `canonicalJSON(payload) → Ed25519.sign(jsonBytes)`
- 수정: `canonicalJSON(payload) → SHA-256(jsonBytes) → Ed25519.sign(hashBytes)`
- verifier(`approval-verifier.ts`)는 이미 SHA-256 해시에 대해 검증하므로 수정 불필요
- app과 daemon 간 서명/검증 round-trip이 실제로 통과하게 됨

## 2. 완료 조건
- [ ] `SignedApprovalBuilder.ts`에서 `SHA-256` 해시 후 서명하는 코드 존재
- [ ] 서명 round-trip 테스트: builder로 서명 → verifier로 검증 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert (단일 커밋)
- 영향: app 패키지만 (SignedApprovalBuilder)

---

## Scope

### 수정 대상 파일
```
packages/app/src/core/approval/
└── SignedApprovalBuilder.ts    # sign() 내부에 SHA-256 해시 단계 추가
```

### 신규 파일
```
packages/app/tests/
└── signed-approval-builder.test.ts  # 서명 round-trip 테스트
```

### Side Effect 위험
- 기존에 생성된 서명은 검증 실패 (reset 허용)

## FP/FN 검증

### 검증 통과: ✅
- approval-verifier.ts는 이미 SHA-256 해시 기반 검증 → 수정 불필요 (OK)
- daemon 쪽 코드 변경 없음 (OK)

---

> 다음: [Step 02: approval context 전달](step-02-approval-context.md)
