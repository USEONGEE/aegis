# WDK Tools Reference

## Critical: Chain Parameter

**This demo supports chain `999` (HyperEVM) only.**

All tools that take a `chain` parameter must receive the **number** `999`, not a string like "ethereum" or "hyperevm". The `accountIndex` is always `0` unless the user specifies otherwise.

```
✅ chain: "999"
❌ chain: "ethereum"
❌ chain: "hyperevm"
```

## Known Token Addresses (HyperEVM, chain 999)

| Token | Address | Decimals |
|-------|---------|----------|
| USDT0 | `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb` | 6 |
| WHYPE | `0x2Bf3E86E6b74526F6f0490F35981578D14FD2658` | 18 |

Use these addresses when calling `erc20Transfer`, `erc20Approve`, `erc20Balances`, or `hyperlendDepositUsdt`.

## Tool Categories

### 1. Read-Only (safe, no approval needed)

| Tool | Purpose | Key Params |
|------|---------|------------|
| `getBalance` | Check native wallet balance | chain, accountIndex |
| `getWalletAddress` | Get wallet address | chain, accountIndex |
| `erc20Balances` | Query ERC-20 token balances (batch) | tokens (list), owner, chain |
| `policyList` | List active policies | chain, accountIndex |
| `policyPending` | List pending approval requests | chain, accountIndex |
| `listRejections` | Transaction rejection history | chain, accountIndex |
| `listPolicyVersions` | Policy change history | chain, accountIndex |
| `listCrons` | List scheduled jobs | accountIndex |

### 2. Transaction Building (pure computation, no on-chain effect)

These tools **build** a transaction + policy but do NOT execute. You must call `sendTransaction` with the returned `tx` to actually submit.

| Tool | Purpose | Key Params |
|------|---------|------------|
| `erc20Transfer` | Build ERC-20 token transfer | token, to, amount, accountIndex |
| `erc20Approve` | Build ERC-20 approval | token, spender, amount, accountIndex |
| `hyperlendDepositUsdt` | Build HyperLend USDT0 deposit | amount, onBehalfOf, accountIndex |

**Workflow**: build tx → explain to user → `sendTransaction` → policy engine evaluates → auto-sign or ask owner approval.

### 3. Execution (requires policy evaluation)

| Tool | Purpose | Key Params |
|------|---------|------------|
| `sendTransaction` | Submit raw tx on-chain | chain, to, data, value, accountIndex |
| `signTransaction` | Sign without broadcasting | chain, to, data, value, accountIndex |

### 4. Policy Management (requires owner approval)

| Tool | Purpose |
|------|---------|
| `policyRequest` | Request a policy change (pending until owner approves) |

### 5. Scheduling

| Tool | Purpose |
|------|---------|
| `registerCron` | Schedule recurring prompt execution |
| `removeCron` | Remove a scheduled job |

## Common Patterns

### Check wallet address and token balances
```
1. getWalletAddress(chain: "999", accountIndex: 0)
   → returns { address: "0x..." }
2. erc20Balances(tokens: ["0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb"], owner: "0x...", chain: "999")
   → returns { balances: [{ token: "0x...", balance: "1000000" }] }
```

### Transfer tokens (2-step)
```
1. erc20Transfer(token: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", to: "0x...", amount: "1000000", accountIndex: 0)
   → returns { tx, policy, description }
2. sendTransaction(chain: "999", to: tx.to, data: tx.data, value: tx.value, accountIndex: 0)
   → policy engine evaluates → sign or request approval
```

### Deposit to HyperLend (3-step)
```
1. erc20Approve(token: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", spender: HYPERLEND_POOL, amount: "...", accountIndex: 0)
   → returns { tx, policy }
2. sendTransaction(...approve tx...)
3. hyperlendDepositUsdt(amount: "1000000", onBehalfOf: WALLET_ADDRESS, accountIndex: 0)
   → returns { tx, policy }
4. sendTransaction(...deposit tx...)
```

## Error Handling

- `"WDK not initialized"` → Master seed not configured
- `"No wallet registered for blockchain: X"` → Wrong chain value. Use `"999"`
- `"Policy rejected"` → Transaction blocked by policy. Suggest `policyRequest`
- Tool execution timeout (60s) → Retry or simplify the request
