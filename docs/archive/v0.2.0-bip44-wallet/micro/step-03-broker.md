# Step 03: SignedApprovalBroker + ApprovalVerifier

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02

---

## 1. 구현 내용 (design.md 기반)
- `SignedApprovalBroker`: metadata 접근 제거, accountIndex/content 정규 필드 사용
- `wallet_create` case 추가: pending_requests.wallet_name에서 name 읽기 → store.createWallet()
- `wallet_delete` case 추가: store.deleteWallet(accountIndex) 호출
- history 기록 시 seedId → accountIndex
- `device_revoke` case: metadata.signerId → signedApproval.signerId 직접 접근

## 2. 완료 조건
- [ ] `grep -r 'metadata' packages/guarded-wdk/src/signed-approval-broker.ts` 결과 0건
- [ ] `wallet_create` case에서 `pending_requests.wallet_name`을 단일 진실 원천으로 사용
- [ ] `wallet_delete` case에서 cascade 삭제 (store.deleteWallet 호출)
- [ ] history 기록에 `accountIndex` 사용 (seedId 없음)
- [ ] `device_revoke`에서 `signedApproval.signerId` 직접 접근
- [ ] broker 관련 unit test 통과

## 3. 롤백 방법
- `git revert`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── signed-approval-broker.ts  # metadata 제거, wallet_create/delete 추가
└── approval-verifier.ts       # 변경 최소 (accountIndex 영향 없음)
packages/guarded-wdk/tests/
└── approval-broker.test.ts    # metadata → 정규 필드, wallet_create/delete 테스트 추가
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| signed-approval-broker.ts | metadata 제거 + wallet_create/delete | ✅ OK |
| approval-verifier.ts | accountIndex 영향 확인 | ✅ OK (변경 최소) |
| approval-broker.test.ts | 테스트 수정 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| metadata 제거 | ✅ signed-approval-broker.ts | OK |
| wallet_create case | ✅ signed-approval-broker.ts | OK |
| wallet_delete case | ✅ signed-approval-broker.ts | OK |
| history accountIndex | ✅ signed-approval-broker.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: canonical intentHash](step-04-canonical.md)
