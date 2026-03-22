# Step 03: getWalletAddress tool 추가

## 메타데이터
- **난이도**: 🟢
- **선행 조건**: 없음

## 구현 내용
- tool-surface.ts: case + GetWalletAddressResult 타입 + FACADE_REQUIRED 추가
- ai-tool-schema.ts: 스키마 추가
- openclaw-plugin/index.ts: 등록 추가
- TOOLS.md: 행 추가
- openclaw-entrypoint.sh: allow list 추가

## 완료 조건
- [x] curl getWalletAddress → 200 응답
- [x] tsc --noEmit 에러 0

## Scope
- `packages/daemon/src/tool-surface.ts`
- `packages/daemon/src/ai-tool-schema.ts`
- `packages/openclaw-plugin/index.ts`
- `packages/openclaw-plugin/workspace/TOOLS.md`
- `docker/openclaw-entrypoint.sh`
