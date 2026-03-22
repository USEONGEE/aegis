# Step 02: Price Service

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: Step 01 (token types 사용)

---

## 1. 구현 내용
- `daemon/src/price/types.ts` — TokenPriceMap, PriceProvider 타입 (HypurrQuant 포팅)
- `daemon/src/price/constants.ts` — stablecoin fallback, aliases, TTL (HypurrQuant 포팅)
- `daemon/src/price/providers/enso.ts` — Enso API provider (HypurrQuant 포팅)
- `daemon/src/price/service.ts` — fetchPricesByChain (HypurrQuant 포팅)

## 2. 완료 조건
- [ ] `daemon/src/price/types.ts` 에 TokenPriceMap, PriceProvider가 정의됨
- [ ] `daemon/src/price/providers/enso.ts` 에 ensoProvider가 export됨
- [ ] `daemon/src/price/service.ts` 에 fetchPricesByChain이 export됨
- [ ] tsc --noEmit 통과

## 3. 롤백 방법
- `rm -r packages/daemon/src/price/` — 새 파일만 추가

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/price/
├── types.ts           # TokenPriceMap, PriceProvider
├── constants.ts       # fallback, aliases, TTL
├── service.ts         # fetchPricesByChain
└── providers/
    └── enso.ts        # Enso API provider
```

### Side Effect 위험
- 없음 (새 파일만 추가)

---

→ 다음: [Step 03: Portfolio Tool](step-03-portfolio-tool.md)
