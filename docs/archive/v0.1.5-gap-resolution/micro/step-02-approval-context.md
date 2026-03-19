# Step 02: approval context 전달 (Gap 2)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- 새 store API 추가: `loadPendingByRequestId(requestId: string): Promise<PendingRequest | null>`
- `control-handler.ts`에서 tx_approval 처리 시 서버 측 pending에서 context 조회
- `expectedTargetHash`와 `currentPolicyVersion`을 client payload가 아닌 서버 저장값에서 가져옴
- policy_approval도 동일하게 서버 측 pending에서 `expectedTargetHash` 조회
- client가 보낸 값을 신뢰하지 않는 보안 모델 완성

## 2. 완료 조건
- [ ] `loadPendingByRequestId` 메서드가 ApprovalStore 인터페이스에 존재
- [ ] JsonApprovalStore, SqliteApprovalStore 모두 구현
- [ ] control-handler에서 `pending.targetHash`를 사용하는 코드 존재
- [ ] control-handler.test.ts: context가 서버 측 pending에서 조회되는 테스트 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk (store API) + daemon (control-handler)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts           # loadPendingByRequestId 인터페이스 추가
├── json-approval-store.ts      # loadPendingByRequestId 구현
└── sqlite-approval-store.ts    # loadPendingByRequestId 구현

packages/daemon/src/
└── control-handler.ts          # broker.submitApproval에 서버 측 context 전달
```

### Side Effect 위험
- 없음 (기존 API 유지, 새 메서드 추가)

## FP/FN 검증

### 검증 통과: ✅
- approval-verifier.ts는 context를 직접 사용하지 않으므로 제외 (OK)
- broker.submitApproval 시그니처가 context를 받는지 확인 필요

---

> 다음: [Step 03: pairing 보안](step-03-pairing-security.md)
