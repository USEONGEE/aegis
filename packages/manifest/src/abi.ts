/**
 * Minimal ABI encoding utilities for ERC-20 calldata construction.
 * No external dependencies — covers address + uint256 only.
 */

/** Pad a 20-byte hex address to 32-byte ABI word (left-padded with zeros). */
export function encodeAddress(addr: string): string {
  return addr.replace(/^0x/i, '').toLowerCase().padStart(64, '0')
}

/** Encode a decimal string as 32-byte uint256 ABI word (left-padded with zeros). */
export function encodeUint256(value: string): string {
  return BigInt(value).toString(16).padStart(64, '0')
}

/** Concatenate 4-byte selector + encoded args into calldata hex string. */
export function encodeCall(selector: string, args: string[]): string {
  return selector + args.join('')
}
