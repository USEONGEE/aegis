# DoD - v0.5.11

## 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| 1 | `transfer` tool이 ai-tool-schema, tool-surface, OpenClaw 플러그인, TOOLS.md, allow list에서 제거됨 | grep "transfer" 각 파일 → 주석만 존재 |
| 2 | `erc20Transfer`, `erc20Approve`, `hyperlendDepositUsdt` 3개 tool이 tool-surface에 case 존재 | grep "case 'erc20Transfer'" tool-surface.ts |
| 3 | `getWalletAddress` tool이 18개 도구 목록에 포함 | grep "getWalletAddress" ai-tool-schema.ts, tool-surface.ts, index.ts |
| 4 | wdk-host.ts의 EVM_CHAIN_KEY가 '999' | grep "EVM_CHAIN_KEY" wdk-host.ts |
| 5 | tsc --noEmit 에러 0 | `npx tsc --noEmit` |

## 기본 검증
- [x] 타입 체크 통과
