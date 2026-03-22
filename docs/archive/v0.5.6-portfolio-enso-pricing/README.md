# Portfolio Enso Pricing — v0.5.6

## 문제 정의

### 현상
- DashboardScreen(Wallet 탭)에서 자산을 보여주는 UI가 존재하나, 실제 온체인 잔액을 조회하지 않음
- 토큰 잔액과 USD 가치가 daemon AI의 채팅 응답에 의존 (수동 pull-to-refresh → AI에게 "잔액 보여줘" 요청)
- 999체인(Hyperliquid EVM)에 등록된 토큰 목록이 없음
- USD 환산 가격을 가져올 수단이 없음

### 원인
- 온체인 잔액 조회 + 가격 피드 인프라가 아직 구현되지 않음
- 토큰 레지스트리(어떤 토큰을 추적할지)가 정의되어 있지 않음
- 가격 조회 provider(Enso 등)가 통합되어 있지 않음

### 영향
- 사용자가 자신의 자산 현황을 실시간으로 확인할 수 없음
- 자산 가치를 확인하려면 AI와 대화해야 하므로 UX가 비직관적
- 포트폴리오 총 가치를 한눈에 파악할 수 없음

### 목표
1. HypurrQuant_FE의 `core/price` + `core/token` 모듈을 WDK-APP에 포팅
2. 999체인 토큰 목록을 그대로 가져와서 레지스트리 구성
3. Enso API를 통해 토큰별 USD 가격 조회
4. DashboardScreen에서 실제 온체인 잔액 × Enso 가격 = USD 가치를 표시

### 비목표 (Out of Scope)
- 999체인 외 다른 체인 지원 (추후 확장)
- 토큰 스왑/트레이드 기능
- DeFi Position 표시 개선 (기존 유지)
- 가격 히스토리/차트
- 서버사이드 가격 캐시 (cron sync) — daemon에서 직접 조회로 시작

## 제약사항
- Enso API free plan: 요청 간 10초 간격 rate limit
- HypurrQuant_FE 코드를 최대한 그대로 포팅 (검증된 구현 재활용)
- daemon이 온체인 잔액을 조회할 수 있어야 함 (WDK getBalance 활용)

## 레퍼런스
- HypurrQuant_FE price 모듈: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/packages/core/price/`
- HypurrQuant_FE token 모듈: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/packages/core/token/`
- Enso API: `https://api.enso.finance/api/v1/prices/{chainId}?addresses=...`
