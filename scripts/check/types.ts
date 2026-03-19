export interface Violation {
  file: string
  line: number
  message: string
}

export interface CheckResult {
  name: string
  passed: boolean
  violations: Violation[]
}

export type CheckFn = () => CheckResult | Promise<CheckResult>

export interface CheckEntry {
  name: string
  description: string
  group: 'guarded-wdk' | 'server' | 'cross'
  fn: CheckFn
}
