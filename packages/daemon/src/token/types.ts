// Token metadata — ported from HypurrQuant_FE core/token

export type TokenInfo = {
  chainId: number
  address: `0x${string}`
  symbol: string
  decimals: number
  name: string | null
}
