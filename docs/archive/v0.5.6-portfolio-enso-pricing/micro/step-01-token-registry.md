# Step 01: Token Registry

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: 없음

---

## 1. 구현 내용
- `daemon/src/token/types.ts` — TokenInfo 타입 정의 (HypurrQuant 포팅)
- `daemon/src/token/hyperliquid.ts` — 999체인 토큰 목록 (HypurrQuant 포팅)
- `daemon/src/token/constants.ts` — KNOWN_TOKENS 배열, findKnownToken 함수

## 2. 완료 조건
- [ ] `daemon/src/token/types.ts` 에 TokenInfo 타입이 정의됨
- [ ] `daemon/src/token/hyperliquid.ts` 에 999체인 토큰 70+개가 정의됨
- [ ] `daemon/src/token/constants.ts` 에 KNOWN_TOKENS, findKnownToken이 export됨
- [ ] tsc --noEmit 통과

## 3. 롤백 방법
- `rm -r packages/daemon/src/token/` — 새 파일만 추가하므로 삭제로 롤백

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/token/
├── types.ts        # TokenInfo 타입
├── hyperliquid.ts  # 999체인 토큰 목록
└── constants.ts    # 레지스트리 + 조회 함수
```

### Side Effect 위험
- 없음 (새 파일만 추가, 기존 코드 수정 없음)

---

→ 다음: [Step 02: Price Service](step-02-price-service.md)
