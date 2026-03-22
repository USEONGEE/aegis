# Step 02: manifest tool 3개 daemon 연결

## 메타데이터
- **난이도**: 🟢
- **선행 조건**: 없음

## 구현 내용
- ai-tool-schema.ts: erc20Transfer, erc20Approve, hyperlendDepositUsdt 스키마 추가
- tool-surface.ts: 3개 case 추가 (dynamic import @wdk-app/manifest, 순수 함수 호출)
- FACADE_REQUIRED에 미추가 (IO 없음)

## 완료 조건
- [x] grep "case 'erc20Transfer'" tool-surface.ts → 존재
- [x] tsc --noEmit 에러 0

## Scope
- `packages/daemon/src/tool-surface.ts`
- `packages/daemon/src/ai-tool-schema.ts`
