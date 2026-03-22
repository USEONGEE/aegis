# Transfer Tool 정리 + Manifest Tool 연결 + getWalletAddress 추가 — v0.5.11

## 문제 정의

### 현상
- `transfer` tool이 policy 없이 바로 실행 → 항상 PolicyRejectionError
- manifest의 `erc20Transfer`가 tx+policy 빌드를 제공하는데 `transfer`와 기능 중복
- AI가 지갑 주소를 조회할 tool이 없음
- manifest tool 3개(erc20Transfer, erc20Approve, hyperlendDepositUsdt)가 daemon에 미연결

### 목표
- `transfer` tool 제거 — manifest의 erc20Transfer → policyRequest → sendTransaction 플로우로 대체
- manifest tool 3개를 daemon tool-surface에 연결
- `getWalletAddress` tool 추가
- chain key `'1'` → `'999'` 수정 (HyperEVM 데모)

### 비목표
- native coin 전송 tool 추가
- 멀티 월렛 UI 구현
- StubWalletManager를 실제 EVM WalletManager로 교체
