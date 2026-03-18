import { createHash } from 'node:crypto'

/** JSON-compatible primitive types */
type JsonPrimitive = string | number | boolean | null

/** Recursive JSON-compatible value */
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/**
 * Input fields for computing an intent hash.
 */
export interface IntentInput {
  chain: string | number
  to: string
  data: string
  value?: string | number | null
}

/**
 * A single policy object (flexible shape, recursively normalized).
 */
export type PolicyObject = Record<string, JsonValue>

/**
 * Recursively sort all object keys alphabetically.
 * Arrays are preserved in order, but objects inside arrays are also sorted.
 * Primitives (string, number, boolean, null) are returned as-is.
 */
export function sortKeysDeep(obj: JsonValue): JsonValue {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortKeysDeep)

  const sorted: Record<string, JsonValue> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key])
  }
  return sorted
}

/**
 * Produce canonical JSON string from an object.
 * Keys are recursively sorted, no whitespace.
 */
export function canonicalJSON(obj: JsonValue): string {
  return JSON.stringify(sortKeysDeep(obj))
}

/**
 * Normalize an address to lowercase.
 */
function normalizeAddress(addr: string): string {
  return typeof addr === 'string' ? addr.toLowerCase() : addr
}

/**
 * Normalize a value to decimal string.
 */
function normalizeValue(val: string | number | null | undefined): string {
  if (val === undefined || val === null) return '0'
  return String(val)
}

/**
 * Compute intentHash from an unsigned intent.
 * Fields: chain, to (lowercase), data (lowercase), value (decimal string).
 * Keys sorted alphabetically -> SHA-256 hex with 0x prefix.
 */
export function intentHash({ chain, to, data, value }: IntentInput): string {
  const normalized: Record<string, string> = {
    chain: String(chain),
    data: normalizeAddress(data),
    to: normalizeAddress(to),
    value: normalizeValue(value)
  }
  const json: string = JSON.stringify(normalized)
  return '0x' + createHash('sha256').update(json).digest('hex')
}

/**
 * Compute policyHash from a policies array.
 * Each policy is recursively key-sorted, addresses lowercased, numbers as decimal strings.
 * No whitespace in JSON -> SHA-256 hex with 0x prefix.
 */
export function policyHash(policies: PolicyObject[]): string {
  const normalized: JsonValue[] = policies.map(
    (p: PolicyObject): JsonValue => normalizePolicyValues(sortKeysDeep(p as JsonValue))
  )
  const json: string = JSON.stringify(normalized)
  return '0x' + createHash('sha256').update(json).digest('hex')
}

/**
 * Recursively normalize policy values:
 * - addresses (hex strings starting with 0x): lowercase
 * - numbers: decimal string
 */
function normalizePolicyValues(obj: JsonValue): JsonValue {
  if (obj === null || obj === undefined) return obj as JsonValue
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    if (obj.startsWith('0x') || obj.startsWith('0X')) return obj.toLowerCase()
    return obj
  }
  if (Array.isArray(obj)) return obj.map(normalizePolicyValues)
  if (typeof obj === 'object') {
    const result: Record<string, JsonValue> = {}
    for (const [key, val] of Object.entries(obj)) {
      result[key] = normalizePolicyValues(val)
    }
    return result
  }
  return obj
}
