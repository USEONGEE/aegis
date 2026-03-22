# Step 03: Portfolio Tool

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (파일 삭제 + tool-surface 변경 revert)
- **선행 조건**: Step 01, 02

---

## 1. 구현 내용
- `daemon/src/portfolio.ts` — getPortfolio 함수: RPC로 잔액 조회 + price service로 가격 조회 + 합산
- `daemon/src/tool-surface.ts` — getPortfolio case 추가

## 2. 완료 조건
- [ ] `daemon/src/portfolio.ts` 에 getPortfolio 함수가 export됨
- [ ] getPortfolio가 wallet address로 999체인 토큰 잔액을 RPC 조회함
- [ ] getPortfolio가 Enso로 USD 가격을 조회함
- [ ] getPortfolio가 `{ balances: TokenBalance[] }` 형태로 반환함 (TokenBalance: symbol, name, balance, usdValue, chainId, address)
- [ ] non-zero 잔액 토큰만 결과에 포함됨
- [ ] tool-surface.ts에 'getPortfolio' case가 등록됨
- [ ] facade가 null이면 빈 배열 반환
- [ ] tsc --noEmit 통과

## 3. 롤백 방법
- `rm packages/daemon/src/portfolio.ts`
- tool-surface.ts의 getPortfolio case 제거

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
└── portfolio.ts       # getPortfolio 함수
```

### 수정 대상 파일
```
packages/daemon/src/
└── tool-surface.ts    # getPortfolio case 추가
```

### Side Effect 위험
- tool-surface.ts 수정 — 기존 tool 동작에 영향 없음 (새 case 추가만)

---

→ 다음: [Step 04: DashboardScreen 연결](step-04-dashboard-wiring.md)
