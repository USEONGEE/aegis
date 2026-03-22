# v0.5.7 설계 — Manifest DeFi Tools

## 핵심 개념

```
DeFi Tool = 계산기
  input:  사람 언어 파라미터 (token, amount, recipient)
  output: { tx, policy, description }
    tx     = 서명 가능한 calldata
    policy = 해당 tx를 허용하는 CallPolicy
```

## 아키텍처

```
packages/manifest/src/
  abi.ts              ← ABI 인코딩 유틸 (address, uint256)
  tools/
    types.ts          ← ToolCall 타입 (공통 규격)
    erc20.ts          ← erc20Transfer, erc20Approve
    hyperlend.ts      ← hyperlendDepositUsdt
```

## ToolCall 규격

```typescript
interface ToolCall {
  tx: { to: string; data: string; value: string }
  policy: { type: 'call'; permissions: PermissionDict }
  description: string
}
```

모든 DeFi tool이 이 타입을 반환. policy는 guarded-wdk의 PermissionDict 규격과 동일.

## ABI 인코딩

ethers/viem 없이 자체 구현. ERC-20 수준에서는 address + uint256 패딩만 필요:

- `encodeAddress(addr)`: 20바이트 → 32바이트 좌측 패딩
- `encodeUint256(value)`: decimal string → 32바이트 hex 좌측 패딩
- `encodeCall(selector, args[])`: selector + args 연결

## Policy 생성 전략

tx calldata를 구성하는 동일한 파라미터에서 ArgCondition 생성:
- 주소 파라미터 → `{ condition: 'EQ', value: addr.toLowerCase() }`
- 금액 파라미터 → `{ condition: 'LTE', value: amount }`

BigInt 비교로 동작 (guarded-wdk matchCondition 호환 확인됨).

## 등록 경로

```
manifest (순수 계산) → daemon tool-surface (실행) → OpenClaw plugin (AI 노출)
```

- manifest: 구현 완료
- OpenClaw plugin: 등록 완료 (3개 tool)
- daemon: v0.5.5 담당자에게 위임
