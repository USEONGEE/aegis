// Fixture: console usage violations (for no-console check)

// VIOLATION: all console methods
console.log('test')
console.error('fail')
console.warn('warning')
console.info('info')
console.debug('debug')

// NON-VIOLATION: string literal containing console
const s = 'console.log("not a call")'

// NON-VIOLATION: commented out
// console.log('commented')

// NON-VIOLATION: bracket notation (intentionally out of scope — E10)
// console['log']('bracket')
