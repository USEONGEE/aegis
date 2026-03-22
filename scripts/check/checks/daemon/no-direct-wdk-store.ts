import { createRestrictedUsageCheck } from '../../shared/restricted-usage.js'

export const noDaemonDirectWdkStore = createRestrictedUsageCheck({
  name: 'daemon/no-direct-wdk-store-access',
  packages: ['daemon'],
  rules: [
    // WdkStore 타입 runtime import 금지 (wdk-host.ts boot 예외)
    { kind: 'import', symbolName: 'WdkStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'SqliteWdkStore', fromModules: ['@wdk-app/guarded-wdk'],
      allow: ['packages/daemon/src/wdk-host.ts'] },
    { kind: 'import', symbolName: 'JsonWdkStore', fromModules: ['@wdk-app/guarded-wdk'] },

    // 구 ApprovalStore import 금지
    { kind: 'import', symbolName: 'ApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'SqliteApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },
    { kind: 'import', symbolName: 'JsonApprovalStore', fromModules: ['@wdk-app/guarded-wdk'] },

    // getApprovalStore / getApprovalBroker 메서드 호출 금지
    { kind: 'method-call', methodName: 'getApprovalStore' },
    { kind: 'method-call', methodName: 'getApprovalBroker' },
  ]
})
