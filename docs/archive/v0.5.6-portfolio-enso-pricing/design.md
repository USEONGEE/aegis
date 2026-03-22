# 설계 - v0.5.6

## 변경 규모
**규모**: 일반 기능
**근거**: 새 모듈 추가 (token, price), 외부 API 연동 (Enso), 기존 tool-surface 확장, DashboardScreen 수정

---

## 문제 요약
DashboardScreen이 실제 온체인 잔액/가격을 조회하지 않고 AI 채팅에 의존함. HypurrQuant_FE의 검증된 price/token 모듈을 포팅하여 999체인 자산 + Enso USD 가격을 표시.

> 상세: [README.md](README.md) 참조

## 접근법

HypurrQuant_FE의 `core/price/` + `core/token/` 모듈을 daemon에 포팅하고, `getPortfolio` 도구를 추가하여 DashboardScreen에서 실제 자산을 표시한다.

1. **Token Registry**: HypurrQuant의 hyperliquid.ts 토큰 목록 + types/constants를 `daemon/src/token/`에 포팅
2. **Price Service**: Enso provider + pair-cache + fallback/alias를 `daemon/src/price/`에 포팅
3. **Balance Fetcher**: JSON-RPC `eth_getBalance` + ERC20 `balanceOf` eth_call로 잔액 조회
4. **getPortfolio Tool**: balance × price = USD 합산, tool-surface에 등록
5. **DashboardScreen**: 앱 진입 시 query 채널로 getPortfolio 호출, 결과 표시

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: App에서 직접 Enso 호출 | 간단 | 아키텍처 원칙 위반 (App은 Relay만 통신) | ❌ |
| B: Daemon에서 조회 + Relay 전달 | 기존 패턴 준수, daemon이 이미 RPC 접근 | 약간 복잡 | ✅ |
| C: Relay에서 가격 캐시 | 중앙 캐시 | Relay에 외부 API 의존 추가, 과도 | ❌ |

**선택 이유**: B — daemon은 이미 WDK를 통해 체인에 접근하고, tool-surface 패턴이 확립되어 있음.

## 기술 결정

1. **토큰/가격 모듈 위치**: `packages/daemon/src/token/`, `packages/daemon/src/price/` — Primitive First, daemon 단독 사용
2. **RPC**: Hyperliquid EVM 퍼블릭 RPC (`https://api.hyperliquid.xyz/evm`) 직접 사용, 설정 불필요
3. **잔액 조회**: 개별 `eth_call` (balanceOf) + `eth_getBalance` (네이티브), `Promise.allSettled`로 병렬화
4. **가격 조회**: Enso Finance API (HypurrQuant 구현 그대로 포팅)
5. **캐싱**: 5분 TTL pair-cache (HypurrQuant 구현 그대로)
6. **앱 통신**: `query`/`query_result` 채널 (비영속, WS 직접 전달)

---

## 범위 / 비범위

**범위 (In Scope)**:
- Token registry (999 체인만)
- Price service (Enso provider)
- Balance fetcher (native + ERC20)
- getPortfolio tool
- DashboardScreen 연결

**비범위 (Out of Scope)**:
- 999 외 체인 지원
- Multicall 최적화 (추후)
- 서버사이드 가격 캐시 cron
- DeFi Position 개선

## 아키텍처 개요

```
App DashboardScreen
  ↓ query: { type: 'getPortfolio' }
Relay (WS passthrough)
  ↓
Daemon
  ├── token/constants.ts → 999체인 토큰 목록
  ├── price/service.ts → Enso API로 USD 가격 조회
  ├── portfolio.ts → RPC로 잔액 조회 + 가격 합산
  └── tool-surface.ts → getPortfolio 도구 등록
  ↓ query_result: { balances: TokenBalance[] }
Relay (WS passthrough)
  ↓
App DashboardScreen → 표시
```

## 데이터 흐름

```
1. App mount/refresh → relay.sendQuery('getPortfolio', { chain: 999 })
2. Relay → WS forward → Daemon
3. Daemon: KNOWN_TOKENS에서 999체인 토큰 목록 추출
4. Daemon: wallet address 확보 (facade.getAccount → getAddress)
5. Daemon: Promise.allSettled로 각 토큰 balanceOf RPC 호출
6. Daemon: non-zero 잔액 토큰만 필터
7. Daemon: fetchPricesByChain(999, non-zero 토큰 주소들)
8. Daemon: balance × price = usdValue 계산
9. Daemon → query_result → Relay → App
10. App: setBalances + setTotalUSD
```

## 테스트 전략

- **Unit**: price service의 캐싱/fallback/alias 로직 (mock provider)
- **Unit**: balance fetcher의 hex 파싱 로직
- **수동**: DashboardScreen에서 실제 잔액 + USD 가치 표시 확인

---

## 실패/에러 처리

N/A: Enso 실패 시 stablecoin fallback 가격 사용 (HypurrQuant 구현). RPC 실패 시 해당 토큰 skip (allSettled). 앱에는 성공한 토큰만 표시.

## 성능/스케일

N/A: ~70 토큰 × 개별 RPC call = 1-3초. Enso batch 55개씩 + 10초 rate limit. 5분 캐시로 반복 요청 방지. 추후 multicall 최적화 가능.

## 리스크/오픈 이슈

1. **Hyperliquid RPC rate limit**: 퍼블릭 RPC가 70개 동시 요청을 허용하는지 미확인 → allSettled로 부분 실패 허용
2. **wallet address 접근**: `facade.getAccount` → `getAddress()` 패턴이 실제 주소를 반환하는지 확인 필요
