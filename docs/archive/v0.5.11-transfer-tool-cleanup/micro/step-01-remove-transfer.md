# Step 01: transfer tool 제거

## 메타데이터
- **난이도**: 🟢
- **선행 조건**: 없음

## 구현 내용
- tool-surface.ts: case 'transfer' 제거, TransferResult/TransferArgs/encodeTransferData 제거
- ai-tool-schema.ts: transfer 스키마 제거
- openclaw-plugin/index.ts: transfer 등록 제거
- openclaw-entrypoint.sh: allow list에서 제거
- TOOLS.md: transfer 행 제거
- 모든 제거 위치에 "erc20Transfer + policyRequest + sendTransaction으로 대체" 주석

## 완료 조건
- [x] grep "case 'transfer'" tool-surface.ts → 없음
- [x] tsc --noEmit 에러 0

## Scope
- `packages/daemon/src/tool-surface.ts`
- `packages/daemon/src/ai-tool-schema.ts`
- `packages/openclaw-plugin/index.ts`
- `packages/openclaw-plugin/workspace/TOOLS.md`
- `docker/openclaw-entrypoint.sh`
