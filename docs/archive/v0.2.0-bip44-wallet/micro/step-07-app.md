# Step 07: app 최소 연동

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 06

---

## 1. 구현 내용 (design.md 기반)
- `app/src/core/approval/types.ts`: ApprovalType에 wallet_create/wallet_delete 추가, metadata 제거, accountIndex/content 추가
- `app/src/core/approval/SignedApprovalBuilder.ts`: metadata 접근 → accountIndex/content 정규 필드
- `app/src/core/relay/RelayClient.ts`: metadata 전달 → accountIndex/content 전달
- `app/src/domains/approval/screens/ApprovalScreen.tsx`: content 표시 + wallet 이름 표시

## 2. 완료 조건
- [ ] `grep -r 'metadata' packages/app/src/core/approval/ packages/app/src/core/relay/RelayClient.ts` 결과 0건
- [ ] `ApprovalType`에 `wallet_create`, `wallet_delete` 포함
- [ ] `ApprovalScreen`에서 `content`와 wallet 이름(accountIndex 기반) 표시 코드 존재
- [ ] 수동 검증: Expo 실행 → 승인 요청 → content 문구 + wallet 이름 렌더링 확인

## 3. 롤백 방법
- `git revert`

---

## Scope

### 수정 대상 파일
```
packages/app/src/core/
├── approval/types.ts              # ApprovalType, metadata 제거
├── approval/SignedApprovalBuilder.ts  # metadata → 정규 필드
└── relay/RelayClient.ts           # metadata → accountIndex/content
packages/app/src/domains/approval/screens/
└── ApprovalScreen.tsx             # content/wallet 표시
```

## FP/FN 검증
- Scope 4파일 모두 구현 내용에 직접 근거 있음 → FP 없음
- 구현 내용의 모든 항목이 Scope에 반영됨 → FN 없음
- **검증 통과: ✅**

---

→ 완료: Phase Complete
