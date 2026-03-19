// Fixture: type assertion violation
// This file is NOT in any package's src/ — it exists only for negative testing.

const x = {} as any
const y = x as unknown as string

export { x, y }
