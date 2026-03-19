# Step 43: app - Dashboard 탭

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 36 (RelayClient)

---

## 1. 구현 내용 (design.md + PRD 기반)

Dashboard 탭 — 토큰 잔고 (체인별) + DeFi 포지션 요약. daemon에서 Relay를 통해 데이터 수신.

- `src/domains/dashboard/screens/DashboardScreen.tsx`: Dashboard 탭 메인 화면
- `src/stores/useWalletStore.ts`: zustand 지갑 상태

**Token Balances (per chain)**:
- daemon의 getBalance tool 결과를 Relay 경유로 수신
- 체인별 네이티브 토큰 + ERC20 잔고 표시
- 각 토큰: 이름, 심볼, 잔고, USD 환산 (있으면)
- pull-to-refresh로 갱신

**DeFi Positions Summary**:
- daemon이 보내는 포지션 정보 표시 (있을 경우)
- Aave: health factor, 대출/예금 금액
- Phase 1은 기본 표시만 (상세 DeFi 대시보드는 Phase 2)
- 포지션 없으면 "No DeFi positions" placeholder

**Data from Daemon via Relay**:
- RelayClient를 통해 daemon에 잔고/포지션 요청
- chat_queue로 getBalance 요청 → 응답 수신
- 또는 control_channel로 주기적 상태 동기화 (status_sync)
- daemon 재시작 시 자동 갱신

**Wallet Info**:
- 현재 active seed 이름
- 체인별 계정 주소 (truncated + 복사 기능)

## 2. 완료 조건
- [ ] `src/domains/dashboard/screens/DashboardScreen.tsx` 구현 (placeholder 대체)
- [ ] Token Balances 섹션: 체인별 토큰 잔고 리스트
- [ ] 각 토큰: 이름, 심볼, 잔고, USD 환산 (있으면)
- [ ] DeFi Positions 섹션: 포지션 정보 카드 (기본)
- [ ] 포지션 없으면 "No DeFi positions" placeholder
- [ ] Wallet Info 섹션: active seed 이름, 체인별 주소 (truncated + 복사)
- [ ] `src/stores/useWalletStore.ts` 생성 (zustand)
- [ ] balances 상태 관리 (chain별 토큰 잔고)
- [ ] positions 상태 관리 (DeFi 포지션)
- [ ] activeSeedName 상태
- [ ] fetchBalances 액션: RelayClient 경유 → daemon getBalance 결과 수신
- [ ] pull-to-refresh 지원
- [ ] 로딩 상태 표시 (ActivityIndicator)
- [ ] 잔고 없을 시 "No balances" placeholder

## 3. 롤백 방법
- `src/domains/dashboard/screens/DashboardScreen.tsx`를 placeholder로 복원
- `src/stores/useWalletStore.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/stores/
    useWalletStore.ts              # zustand 지갑 상태 (balances + positions)
```

### 수정 대상 파일
```
packages/app/src/domains/dashboard/screens/DashboardScreen.tsx  # placeholder → 실제 구현
```

### Side Effect 위험
- DashboardScreen.tsx 수정 — placeholder 대체
- RelayClient (Step 36) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| DashboardScreen.tsx | Dashboard 탭 UI (PRD Layer 5 Dashboard 탭) | ✅ OK |
| useWalletStore.ts | 지갑 상태 관리 (design.md stores/useWalletStore.ts) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Token balances (per chain) | ✅ DashboardScreen.tsx | OK |
| DeFi positions summary | ✅ DashboardScreen.tsx | OK |
| Data from daemon via Relay | ✅ useWalletStore.ts (RelayClient 연동) | OK |
| Wallet info (seed name, addresses) | ✅ DashboardScreen.tsx | OK |

### 검증 통과: ✅

---

→ 다음: [Step 44: app - Settings 탭](step-44-settings-tab.md)
