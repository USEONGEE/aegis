// Fixture: browser global violation
// This file is NOT in any package's src/ — it exists only for negative testing.

const url = window.location.href
const el = document.getElementById('app')

export { url, el }
