# KittenSwap 전면 제거 — v0.5.13

## 문제 정의

### 현상
KittenSwap(kittenFetch/kittenMint/kittenBurn) 도구 3개와 `packages/kitten-cli` 패키지가 존재하지만, 데모에서 사용하지 않으며 HyperEVM(chain 999) 환경과 무관한 dead code.

### 목표
- KittenSwap 관련 코드 전면 제거 (daemon tool-surface, ai-tool-schema, OpenClaw 플러그인, TOOLS.md, config, allow list)
- `packages/kitten-cli` 패키지 삭제
- AI 도구 목록을 18개 → 15개로 정리

### 비목표
- KittenSwap 대체 DeFi 프로토콜 추가
