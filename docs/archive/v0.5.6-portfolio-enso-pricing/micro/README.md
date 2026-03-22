# 작업 티켓 - v0.5.6

## 전체 현황

| # | Step | 난이도 | 롤백 | 개발 | 완료일 |
|---|------|--------|------|------|--------|
| 01 | Token Registry | 🟢 | ✅ | ⏳ | - |
| 02 | Price Service | 🟢 | ✅ | ⏳ | - |
| 03 | Portfolio Tool | 🟠 | ✅ | ⏳ | - |
| 04 | DashboardScreen 연결 | 🟡 | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| HypurrQuant token 모듈 포팅 | Step 01 | ✅ |
| HypurrQuant price 모듈 포팅 | Step 02 | ✅ |
| 999체인 토큰 잔액 조회 | Step 03 | ✅ |
| Enso로 USD 가격 계산 | Step 02, 03 | ✅ |
| DashboardScreen 실제 자산 표시 | Step 04 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: token registry 존재 | Step 01 | ✅ |
| F2: price service 존재 | Step 02 | ✅ |
| F3: getPortfolio tool 등록 | Step 03 | ✅ |
| F4: getPortfolio 반환값 | Step 03 | ✅ |
| F5: 앱 자동 조회 | Step 04 | ✅ |
| F6: pull-to-refresh | Step 04 | ✅ |
| E1: Enso 장애 fallback | Step 02 | ✅ |
| E2: RPC 부분 실패 | Step 03 | ✅ |
| E3: facade null | Step 03 | ✅ |
| E4: 전체 잔액 0 | Step 03 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| token/price 모듈 daemon 내부 | Step 01, 02 | ✅ |
| Enso API provider | Step 02 | ✅ |
| 개별 eth_call + allSettled | Step 03 | ✅ |
| query/query_result 채널 | Step 04 | ✅ |

## Step 상세
- [Step 01: Token Registry](step-01-token-registry.md)
- [Step 02: Price Service](step-02-price-service.md)
- [Step 03: Portfolio Tool](step-03-portfolio-tool.md)
- [Step 04: DashboardScreen 연결](step-04-dashboard-wiring.md)
