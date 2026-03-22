# v0.5.7 DoD — Manifest DeFi Tools

## 기능 요구사항

| ID | 조건 | 검증 |
|----|------|------|
| F1 | 정적 examples 디렉토리 삭제 | `ls packages/manifest/src/examples` → 존재하지 않음 |
| F2 | ToolCall 타입 export | `import { ToolCall } from '@wdk-app/manifest'` 컴파일 성공 |
| F3 | erc20Transfer가 {tx, policy, description} 반환 | 단위 테스트 통과 |
| F4 | erc20Approve가 {tx, policy, description} 반환 | 단위 테스트 통과 |
| F5 | hyperlendDepositUsdt가 {tx, policy, description} 반환 | 단위 테스트 통과 |
| F6 | hyperlendDepositUsdt의 calldata가 실제 온체인 tx와 일치 | `0xda12cae2...` 트랜잭션 calldata 비교 테스트 |
| F7 | 모든 tool의 policy가 validatePolicies 통과 | guarded-wdk 통합 테스트 |
| F8 | OpenClaw 플러그인에 3개 tool 등록 | plugin index.ts에 registerTool 호출 존재 |

## 비기능 요구사항

| ID | 조건 | 검증 |
|----|------|------|
| NF1 | 외부 ABI 라이브러리 미사용 | package.json에 ethers/viem 없음 |
| NF2 | manifest tool은 순수 함수 (IO 없음) | 코드에 fetch/fs/net import 없음 |
| NF3 | 기존 테스트 깨지지 않음 | `npm test` 전체 통과 |

## 검증 결과

- [x] F1: examples 디렉토리 삭제됨
- [x] F2: index.ts에서 ToolCall export
- [x] F3: erc20.test.ts 통과
- [x] F4: erc20.test.ts 통과
- [x] F5: hyperlend.test.ts 통과
- [x] F6: 실제 온체인 calldata byte-for-byte 일치
- [x] F7: validatePolicies 통합 테스트 통과
- [x] F8: openclaw-plugin/index.ts에 등록 완료
- [x] NF1: 외부 ABI 라이브러리 없음
- [x] NF2: IO 코드 없음
- [x] NF3: 전체 테스트 13개 통과
