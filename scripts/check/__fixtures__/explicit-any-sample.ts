// Fixture: explicit any violations (for no-explicit-any check)

// VIOLATION: variable typed as any
const x: any = 1

// VIOLATION: as any assertion
const y = {} as any

// VIOLATION: catch parameter typed as any
try {} catch (err: any) { void err }

// VIOLATION: function parameter typed as any
function fn(a: any): void { void a }

// VIOLATION: Record<string, any>
const z: Record<string, any> = {}

// NON-VIOLATION: unknown is fine
const w: unknown = 1

// NON-VIOLATION: as unknown as TargetType (no AnyKeyword)
const v = {} as unknown as string

// NON-VIOLATION: variable named 'any' (Identifier, not AnyKeyword)
// const any = 1
