# 설계 - v0.5.11

## 접근법

1. **transfer tool 제거** — tool-surface case, ai-tool-schema 정의, OpenClaw 플러그인 등록, TOOLS.md, allow list에서 모두 제거. 관련 타입(TransferResult, TransferArgs, encodeTransferData) 삭제.
2. **manifest tool 3개 daemon 연결** — ai-tool-schema에 스키마 추가, tool-surface에 case 추가 (dynamic import + 순수 함수 호출), FACADE_REQUIRED 배열에 미추가 (IO 없음).
3. **getWalletAddress tool 추가** — facade.getAccount().getAddress() 호출. FACADE_REQUIRED에 추가.
4. **chain key 수정** — wdk-host.ts의 EVM_CHAIN_KEY를 '1' → '999'로 변경.
5. **StubWalletManager 주소** — WALLET_ADDRESS 환경변수에서 읽도록 수정.
