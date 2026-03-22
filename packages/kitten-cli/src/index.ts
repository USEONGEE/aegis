#!/usr/bin/env npx tsx
/**
 * kitten-cli — KittenSwap LP CLI for AI agent integration.
 *
 * Commands:
 *   mint   — Build LP mint tx + policy
 *   burn   — Build LP burn (remove liquidity) txs + policy
 *   fetch  — Read pool state (read-only, no policy)
 *
 * Usage:
 *   npx tsx packages/kitten-cli/src/index.ts mint --json '{ ... }'
 *   npx tsx packages/kitten-cli/src/index.ts burn --json '{ ... }'
 *   npx tsx packages/kitten-cli/src/index.ts fetch --pool 0x... --rpc https://...
 */

import { mint } from './commands/mint.js'
import { burn } from './commands/burn.js'
import { fetch } from './commands/fetch.js'
import type { MintInput, BurnInput } from './types.js'

const args = process.argv.slice(2)
const command = args[0]

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

async function main(): Promise<void> {
  switch (command) {
    case 'mint': {
      const json = getFlag('--json')
      if (!json) {
        process.stderr.write('Usage: kitten-cli mint --json \'{ ... }\'\n')
        process.exit(1)
      }
      const input: MintInput = JSON.parse(json)
      const result = mint(input)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }

    case 'burn': {
      const json = getFlag('--json')
      if (!json) {
        process.stderr.write('Usage: kitten-cli burn --json \'{ ... }\'\n')
        process.exit(1)
      }
      const input: BurnInput = JSON.parse(json)
      const result = burn(input)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }

    case 'fetch': {
      const pool = getFlag('--pool')
      const rpc = getFlag('--rpc')
      if (!pool || !rpc) {
        process.stderr.write('Usage: kitten-cli fetch --pool 0x... --rpc https://...\n')
        process.exit(1)
      }
      const result = await fetch({ poolAddress: pool as `0x${string}` }, rpc)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }

    default: {
      process.stderr.write('Commands: mint, burn, fetch\n')
      process.exit(1)
    }
  }
}

main().catch((err: Error) => {
  process.stderr.write(err.message + '\n')
  process.exit(1)
})

// Module exports for programmatic usage
export { mint } from './commands/mint.js'
export { burn } from './commands/burn.js'
export { fetch } from './commands/fetch.js'
export { buildMintPolicy, buildBurnPolicy } from './policy-builder.js'
export type {
  MintInput, MintOutput,
  BurnInput, BurnOutput,
  FetchInput, FetchOutput,
  TxEnvelope,
} from './types.js'
export { KITTENSWAP_CONTRACTS, CHAIN_ID, SELECTORS } from './types.js'
