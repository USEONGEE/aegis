# Step 08: App ApprovalRequest DU

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `ApprovalRequest` DU by `type` discriminant
- `targetPublicKey`는 `DeviceRevokeApprovalRequest`에서만 필수
- 나머지 5개 variant에서 `targetPublicKey` 필드 제거
- `ApprovalRequestBase` 공통 인터페이스 추출

## 2. 완료 조건
- [ ] `rg 'targetPublicKey.*null' packages/app/src/` 결과 0건
- [ ] `ApprovalRequest` DU 존재 (6 variant)
- [ ] `npx tsc -p packages/app/tsconfig.json --noEmit` 통과

## 3. 롤백 방법
- `git revert <commit>` — App 내부 변경만

## Scope

### 수정 대상 파일
```
packages/app/src/
├── core/approval/types.ts                       # ApprovalRequest DU 정의
├── app/providers/AppProviders.tsx                # targetPublicKey fallback 제거 → type narrowing
├── shared/tx/TxApprovalContext.tsx               # ApprovalRequest 소비
├── shared/tx/TxApprovalSheet.tsx                 # ApprovalRequest 소비
├── stores/useApprovalStore.ts                    # ApprovalRequest 소비
├── domains/approval/screens/ApprovalScreen.tsx   # ApprovalRequest 소비
└── domains/settings/screens/SettingsScreen.tsx   # device_revoke 생성 시 타입 맞춤
```

### Side Effect 위험
- App 내부 변경만 — `tsc` typecheck로 누락 감지

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.ts | ApprovalRequest DU 정의 | ✅ OK |
| AppProviders.tsx | targetPublicKey fallback 제거 | ✅ OK |
| TxApprovalContext.tsx | ApprovalRequest 사용 | ✅ OK |
| TxApprovalSheet.tsx | ApprovalRequest 사용 | ✅ OK |
| useApprovalStore.ts | ApprovalRequest 사용 | ✅ OK |
| ApprovalScreen.tsx | ApprovalRequest 사용 | ✅ OK |
| SettingsScreen.tsx | device_revoke 생성 | ✅ OK |

### False Negative (누락)
없음 — `rg 'ApprovalRequest' packages/app/src/` 전수 확인 (8파일, 7개 Scope 포함 + useActivityStore는 타입 변경 불필요)

### 검증 통과: ✅

---

→ 다음: [Step 09: Tool Result Null Cleanup](step-09-tool-result.md)
