# v0.5.7 — Manifest DeFi Tools

## 현재 Step: 개발 완료 (커밋 대기)

| Step | 상태 |
|------|------|
| Step 1: PRD | 완료 |
| Step 2: 설계 | 완료 |
| Step 3: DoD | 완료 |
| Step 4: 티켓 | 완료 |
| Step 5: 개발 | 완료 |

## 변경 파일

### 삭제
- `packages/manifest/src/examples/aave-v3.ts`
- `packages/manifest/src/examples/uniswap-v2.ts`
- `packages/manifest/src/examples/kittenswap.ts`

### 신규
- `packages/manifest/src/abi.ts`
- `packages/manifest/src/tools/types.ts`
- `packages/manifest/src/tools/erc20.ts`
- `packages/manifest/src/tools/hyperlend.ts`
- `packages/manifest/tests/erc20.test.ts`
- `packages/manifest/tests/hyperlend.test.ts`

### 수정
- `packages/manifest/src/index.ts` — examples export 삭제, tools export 추가
- `packages/manifest/tests/manifest-to-policy.test.ts` — 정적 예시 의존 테스트 제거
- `packages/openclaw-plugin/index.ts` — 3개 tool 등록 (15→18)

## 남은 작업 (v0.5.5 담당자에게 위임)
- daemon `tool-surface.ts` case 추가
- daemon `ai-tool-schema.ts` 스키마 추가
