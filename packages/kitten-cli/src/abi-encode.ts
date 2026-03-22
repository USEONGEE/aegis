/**
 * Minimal ABI encoder — covers the subset needed by KittenSwap CLI.
 * Supports: address, uint256, uint128, int24, bool, bytes32, tuple.
 * No external dependencies.
 */

type AbiType = 'address' | 'uint256' | 'uint128' | 'uint160' | 'uint16' | 'uint8' | 'int24' | 'bool' | 'bytes32'

export interface TupleComponent {
  name: string
  type: AbiType
}

function pad32(hex: string): string {
  return hex.padStart(64, '0')
}

function encodeUint(value: bigint): string {
  return pad32(value.toString(16))
}

function encodeInt24(value: number): string {
  if (value >= 0) {
    return pad32(value.toString(16))
  }
  // Two's complement: 2^256 + value
  const twosComp = (1n << 256n) + BigInt(value)
  return pad32(twosComp.toString(16))
}

function encodeAddress(addr: string): string {
  return pad32(addr.replace('0x', '').toLowerCase())
}

function encodeBool(val: boolean): string {
  return pad32(val ? '1' : '0')
}

function encodeValue(type: AbiType, value: string | number | bigint | boolean): string {
  switch (type) {
    case 'address':
      return encodeAddress(value as string)
    case 'uint256':
    case 'uint128':
    case 'uint160':
    case 'uint16':
    case 'uint8':
      return encodeUint(BigInt(value as string | number | bigint))
    case 'int24':
      return encodeInt24(Number(value))
    case 'bool':
      return encodeBool(value as boolean)
    case 'bytes32': {
      const hex = (value as string).replace('0x', '')
      return pad32(hex)
    }
  }
}

/**
 * Encode a function call with a single tuple argument.
 * This covers all KittenSwap functions (mint, decreaseLiquidity, collect).
 *
 * NOTE: For Solidity functions that take a single tuple parameter,
 * the ABI encoding places each field sequentially without a tuple offset pointer,
 * since all fields are static types.
 */
export function encodeTupleCall(
  selector: string,
  components: TupleComponent[],
  values: Record<string, string | number | bigint | boolean>,
): string {
  let encoded = selector.replace('0x', '')

  for (const comp of components) {
    const val = values[comp.name]
    if (val === undefined) {
      throw new Error(`Missing value for component: ${comp.name}`)
    }
    encoded += encodeValue(comp.type, val)
  }

  return '0x' + encoded
}
