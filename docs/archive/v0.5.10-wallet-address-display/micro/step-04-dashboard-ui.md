# Step 04: DashboardScreen UI 확장 (주소 표시 + 지갑 선택 + 추가/삭제)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01, 02, 03

---

## 1. 구현 내용 (design.md 기반)

### 주소 표시
- Wallet 탭 상단에 현재 지갑 주소 표시 (0x1234...abcd 축약)
- 탭하면 클립보드에 전체 주소 복사 (Clipboard API)
- 진입 시 `getWalletAddress` query로 주소 조회

### 지갑 선택
- 지갑 목록 표시 (walletList query 사용)
- 지갑 탭하면 `useWalletStore.selectWallet(index)` 호출
- 선택 변경 시 주소 + 포트폴리오 재조회

### 지갑 추가/삭제
- 추가 버튼: `sendApproval(builder.forWallet({ accountIndex: nextIndex, name: 'Wallet N' }))` 호출
- 삭제: 스와이프 또는 롱프레스 → 확인 다이얼로그 → `sendApproval(builder.forWallet({ ... delete }))` 호출
- 마지막 1개는 삭제 불가 (UI에서 비활성)

### accountIndex 하드코딩 제거
- `getPortfolio` 호출 시 `useWalletStore.selectedAccountIndex` 사용

## 2. 완료 조건
- [ ] Wallet 탭 상단에 현재 지갑 주소가 축약 형태로 표시됨
- [ ] 주소 탭 시 클립보드에 전체 주소 복사 + 피드백 표시
- [ ] 지갑 목록이 렌더링됨 (accountIndex, name 표시)
- [ ] 지갑 선택 시 주소 + 포트폴리오가 해당 지갑으로 전환됨
- [ ] 추가 버튼으로 새 지갑 생성 가능
- [ ] 삭제 가능 (마지막 1개 제외)
- [ ] DashboardScreen에서 `accountIndex: 0` 하드코딩 제거됨
- [ ] `npx tsc --noEmit` 통과

## 3. 롤백 방법
- DashboardScreen.tsx git 복원 → 원복

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/dashboard/screens/DashboardScreen.tsx  # UI 전면 확장
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| useWalletStore | 직접 참조 | Step 03에서 생성 |
| RelayClient.query | 직접 호출 | getWalletAddress, walletList query |
| RelayClient.sendApproval | 직접 호출 | 지갑 생성/삭제 |
| SignedApprovalBuilder | 직접 참조 | forWallet() 호출 |
| Clipboard (expo-clipboard) | 직접 사용 | 주소 복사 |

### Side Effect 위험
- 지갑 생성/삭제 시 sendApproval이 control 채널을 통해 daemon에 전달됨 — 기존 동작 그대로
- 포트폴리오 query가 선택된 accountIndex로 바뀜 — 의도된 변경

### 참고할 기존 패턴
- `DashboardScreen.tsx` — 기존 포트폴리오 조회 패턴
- `AppProviders.tsx:78` — `builder.forWallet()` 사용 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| DashboardScreen.tsx | 주소표시 + 목록 + 선택 + 추가/삭제 + 하드코딩 제거 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 주소 표시/복사 | ✅ | OK |
| 지갑 목록 | ✅ | OK |
| 지갑 선택 | ✅ | OK |
| 지갑 추가/삭제 | ✅ | OK |
| accountIndex 하드코딩 제거 (Dashboard) | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 05: accountIndex 하드코딩 제거 (Policy, Settings)](step-05-hardcode-removal.md)
