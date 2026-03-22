// Token Price types — ported from HypurrQuant_FE core/price

/** lowercase address → USD price */
export type TokenPriceMap = Record<string, number>

/** Price provider interface */
export type PriceProvider = {
  readonly name: string
  fetchPrices (
    chainId: number,
    addresses: readonly `0x${string}`[],
  ): Promise<TokenPriceMap>
}
