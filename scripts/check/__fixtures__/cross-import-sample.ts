// Fixture: cross-package import violation
// This file is NOT in any package's src/ — it exists only for negative testing.

import { something } from '../../../packages/relay/src/config.js'

export function useSomething() {
  return something
}
