# 작업 티켓 - v0.5.10

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Protocol getWalletAddress Query | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | Daemon Query Handler | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | useWalletStore | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | DashboardScreen UI | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | accountIndex 하드코딩 제거 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
03 (독립)
01 + 02 + 03 → 04
03 → 05
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. 현재 지갑 주소 확인/복사 | Step 01, 02, 04 | ✅ |
| 2. 전체 지갑 목록(주소 포함) 조회 | Step 01, 02, 04 | ✅ |
| 3. 지갑 선택 → App 전역 반영 | Step 03, 04, 05 | ✅ |
| 4. 지갑 추가/삭제 | Step 04 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: protocol getWalletAddress 타입 | Step 01 | ✅ |
| F2: daemon query-handler 처리 | Step 02 | ✅ |
| F3: useWalletStore 존재 | Step 03 | ✅ |
| F4: 주소 축약 표시 | Step 04 | ✅ |
| F5: 주소 클립보드 복사 | Step 04 | ✅ |
| F6: 지갑 목록 + 전환 | Step 04 | ✅ |
| F7: 지갑 추가 | Step 04 | ✅ |
| F8: 지갑 삭제 | Step 04 | ✅ |
| F9: 하드코딩 제거 | Step 04, 05 | ✅ |
| N1: tsc 통과 | 전체 | ✅ |
| N2: CI 체크 | 전체 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| getWalletAddress query 추가 | Step 01, 02 | ✅ |
| useWalletStore (zustand) | Step 03 | ✅ |
| 기존 sendApproval 경로 사용 | Step 04 | ✅ |
| 주소 세션 캐시 | Step 03, 04 | ✅ |

## Step 상세
- [Step 01: Protocol getWalletAddress Query](step-01-protocol-query.md)
- [Step 02: Daemon Query Handler](step-02-daemon-query-handler.md)
- [Step 03: useWalletStore](step-03-wallet-store.md)
- [Step 04: DashboardScreen UI](step-04-dashboard-ui.md)
- [Step 05: accountIndex 하드코딩 제거](step-05-hardcode-removal.md)
