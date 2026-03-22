# DoD - v0.5.13

## 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| 1 | `packages/kitten-cli/` 디렉토리 없음 | `ls packages/kitten-cli` → 에러 |
| 2 | daemon 코드에 kitten 참조 없음 | `grep -r "kitten\|Kitten\|KITTEN" packages/daemon/src/ --include="*.ts"` → 주석만 |
| 3 | OpenClaw 플러그인에 kitten 등록 없음 | `grep "kittenFetch\|kittenMint\|kittenBurn" packages/openclaw-plugin/index.ts` → 없음 |
| 4 | tsc --noEmit 에러 0 | `cd packages/daemon && npx tsc --noEmit` |

## 기본 검증
- [ ] 타입 체크 통과
