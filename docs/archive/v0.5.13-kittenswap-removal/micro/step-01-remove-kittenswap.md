# Step 01: KittenSwap 전면 제거

## 메타데이터
- **난이도**: 🟢
- **선행 조건**: 없음

## 구현 내용
1. `packages/kitten-cli/` 삭제
2. tool-surface.ts: 3개 case + 타입 + callKittenCli + args 제거
3. ai-tool-schema.ts: 3개 스키마 제거
4. config.ts: kittenCliPath 제거
5. openclaw-plugin/index.ts: 3개 등록 제거
6. TOOLS.md: KittenSwap 섹션 제거
7. openclaw-entrypoint.sh: allow list에서 제거

## 완료 조건
- [ ] packages/kitten-cli 없음
- [ ] grep kitten daemon/src → 주석만
- [ ] tsc --noEmit 에러 0

## Scope
- `packages/kitten-cli/` (삭제)
- `packages/daemon/src/tool-surface.ts`
- `packages/daemon/src/ai-tool-schema.ts`
- `packages/daemon/src/config.ts`
- `packages/openclaw-plugin/index.ts`
- `packages/openclaw-plugin/workspace/TOOLS.md`
- `docker/openclaw-entrypoint.sh`
