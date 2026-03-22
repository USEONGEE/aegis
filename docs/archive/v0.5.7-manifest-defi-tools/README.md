# v0.5.7 — Manifest DeFi Tools

## 현상

manifest 패키지의 `examples/` 디렉토리에 정적 프로토콜 매니페스트(aave-v3, uniswap-v2, kittenswap)가 존재.
이 정적 데이터는 실제 DeFi 실행에 필요한 동적 파라미터(amount, recipient 등)를 반영하지 못함.

## 원인

manifest의 역할이 "정적 프로토콜 카탈로그"로 설계되었으나,
실제 필요한 것은 "tx params → {tx calldata, fit policy}"를 생성하는 동적 계산기.

## 영향

- AI가 DeFi 기능을 사용할 때 tx와 policy를 별도로 구성해야 함
- 상황별 fit한 policy를 자동 생성할 수 없음
- DeFi tool마다 policy 규격이 제각각 (kittenMint는 kitten-cli 하드코딩)

## 목표

1. 정적 examples 삭제
2. manifest를 "DeFi tool 계산기" 레이어로 전환: params → {tx, policy, description}
3. 모든 DeFi tool이 동일한 `ToolCall` 규격으로 policy를 생성
4. ERC-20 기본 tool + HyperLend USDT deposit tool 구현
5. OpenClaw 플러그인에 등록

## 제약사항

- 외부 ABI 라이브러리(ethers/viem) 의존 금지 — 자체 인코딩
- manifest tool은 순수 함수 (IO 없음, daemon/WDK 의존 없음)
- daemon 연결은 v0.5.5 담당자에게 위임
