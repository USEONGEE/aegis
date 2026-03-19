// Fixture: require() import violation
// This file is NOT in any package's src/ — it exists only for negative testing.

const x = require('foo')
const { bar } = require('bar')

export { x, bar }
