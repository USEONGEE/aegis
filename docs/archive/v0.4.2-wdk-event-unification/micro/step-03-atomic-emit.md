# Step 03: 원자적 Emit + ApprovalFailed

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02

---

## 1. 구현 내용 (design.md 기반)
- `signed-approval-broker.ts`의 `submitApproval()` 리팩토링:
  - ApprovalVerified 즉시 emit 제거 → 버퍼에 축적
  - 도메인 이벤트(PolicyApplied 등)도 버퍼에 축적
  - 도메인 처리(검증→도메인작업→히스토리) 완료 후 best-effort emit
  - 실패 시 ApprovalFailed emit
  - best-effort emit 구간을 try/catch로 감싸 리스너 예외 삼킴
- `ApprovalFailed` 이벤트 payload: `{ type, timestamp, requestId, approvalType, error }`

## 2. 완료 조건
- [ ] `submitApproval()` 내부에서 성공 이벤트가 도메인 처리 완료 후에만 발행됨
- [ ] 도메인 처리 중 실패 시 `ApprovalFailed`만 발행 (성공 이벤트 없음)
- [ ] 성공 시 발행 순서: ApprovalVerified → 도메인이벤트(PolicyApplied 등)
- [ ] `ApprovalFailed` payload에 type, timestamp, requestId, approvalType, error 포함
- [ ] best-effort emit 구간이 try/catch로 감싸져 리스너 예외가 caller에 전파되지 않음
- [ ] `tsc --noEmit` 통과 (guarded-wdk)
- [ ] 기존 guarded-wdk jest 테스트 통과 (emit 순서 변경 반영)

## 3. 롤백 방법
- git revert (signed-approval-broker.ts 변경만)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── signed-approval-broker.ts  # 수정 — submitApproval 리팩토링 + ApprovalFailed
```

### 수정 포인트
- Line 84-90: ApprovalVerified 즉시 emit → 버퍼로 이동
- Line 101-106: PolicyApplied emit → 버퍼
- Line 119-123: ApprovalRejected emit → 버퍼
- Line 148-152: SignerRevoked emit → 버퍼
- Line 165-170: WalletCreated emit → 버퍼
- Line 178-182: WalletDeleted emit → 버퍼
- Line 188-199: appendHistory → 원자성 경계 안 (실패 시 ApprovalFailed)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 04: Broker에 후처리 내재화](step-04-broker-internalize.md)
