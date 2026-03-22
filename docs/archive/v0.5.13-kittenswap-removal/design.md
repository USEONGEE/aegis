# 설계 - v0.5.13

## 접근법

7개 위치에서 KittenSwap 관련 코드를 제거:

1. `packages/kitten-cli/` — 패키지 전체 삭제
2. `packages/daemon/src/tool-surface.ts` — 3개 case + 타입 + callKittenCli 헬퍼 제거
3. `packages/daemon/src/ai-tool-schema.ts` — 3개 스키마 제거
4. `packages/daemon/src/config.ts` — kittenCliPath 필드 제거
5. `packages/openclaw-plugin/index.ts` — 3개 도구 등록 제거
6. `packages/openclaw-plugin/workspace/TOOLS.md` — KittenSwap 섹션 제거
7. `docker/openclaw-entrypoint.sh` — allow list에서 3개 제거
