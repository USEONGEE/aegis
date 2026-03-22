# DoD (Definition of Done) - v0.5.6

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | daemon/src/token/ 에 999체인 토큰 레지스트리가 존재 | `ls packages/daemon/src/token/` 에 types.ts, hyperliquid.ts, constants.ts 존재 |
| F2 | daemon/src/price/ 에 Enso price service가 존재 | `ls packages/daemon/src/price/` 에 types.ts, constants.ts, service.ts, providers/enso.ts 존재 |
| F3 | getPortfolio tool이 tool-surface.ts에 등록됨 | `grep 'getPortfolio' packages/daemon/src/tool-surface.ts` |
| F4 | getPortfolio 호출 시 999체인 토큰 잔액 + USD 가격이 반환됨 | Tool API `/api/tools/getPortfolio` 호출 시 `{ balances: [...] }` 반환 |
| F5 | DashboardScreen에서 앱 진입 시 자동으로 포트폴리오 조회 | 앱 실행 후 Wallet 탭 진입 → 잔액 표시 확인 |
| F6 | DashboardScreen에서 pull-to-refresh 시 포트폴리오 재조회 | pull-to-refresh → 최신 잔액 반영 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 | `npx tsc --noEmit -p packages/daemon/tsconfig.json` |
| N2 | 기존 테스트 깨지지 않음 | `npm test --workspace=packages/daemon` |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | Enso API 장애 | stablecoin은 fallback 가격(1.0) 사용, 나머지는 가격 없이 잔액만 표시 | Enso URL 변경 후 테스트 |
| E2 | RPC 응답 실패 (일부 토큰) | 실패 토큰 skip, 성공 토큰만 표시 | 존재하지 않는 토큰 주소 포함 테스트 |
| E3 | 지갑 미연결 상태 (facade null) | 빈 배열 반환, 에러 아님 | facade=null 상태에서 getPortfolio 호출 |
| E4 | 모든 토큰 잔액이 0 | 빈 배열 반환 (non-zero만 표시) | 잔액 없는 주소로 테스트 |
