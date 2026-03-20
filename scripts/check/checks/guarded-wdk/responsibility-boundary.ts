import { createRestrictedUsageCheck } from '../../shared/restricted-usage.js'

// --- File paths (relative to monorepo root) ---

const BROKER = 'packages/guarded-wdk/src/signed-approval-broker.ts'
const VERIFIER = 'packages/guarded-wdk/src/approval-verifier.ts'
const MIDDLEWARE = 'packages/guarded-wdk/src/guarded-middleware.ts'
const INDEX = 'packages/guarded-wdk/src/index.ts'

const ALL_PACKAGES = ['guarded-wdk', 'daemon', 'relay']

// --- 1. verifyApproval import restricted to broker ---

export const verifierOnlyInBroker = createRestrictedUsageCheck({
  name: 'guarded-wdk/verifier-only-in-broker',
  packages: ALL_PACKAGES,
  rules: [{
    kind: 'import',
    symbolName: 'verifyApproval',
    fromModules: ['approval-verifier', '@wdk-app/guarded-wdk'],
    allow: [BROKER]
  }]
})

// --- 2. Security-sensitive domain mutations only via broker ---
// createWallet, deleteWallet, revokeSigner must only be called inside
// broker's submitApproval() to guarantee unapproved execution is
// structurally impossible.

export const domainOpsOnlyViaBroker = createRestrictedUsageCheck({
  name: 'guarded-wdk/domain-ops-only-via-broker',
  packages: ALL_PACKAGES,
  rules: [
    { kind: 'method-call', methodName: 'createWallet', allow: [BROKER] },
    { kind: 'method-call', methodName: 'deleteWallet', allow: [BROKER] },
    { kind: 'method-call', methodName: 'revokeSigner', allow: [BROKER] },
  ]
})

// --- 3. Middleware must not import store directly ---
// Policy access goes through policyResolver function only.

export const middlewareNoDirectStore = createRestrictedUsageCheck({
  name: 'guarded-wdk/middleware-no-direct-store',
  packages: ['guarded-wdk'],
  rules: [
    { kind: 'import', symbolName: 'ApprovalStore', fromModules: ['approval-store'], deny: [MIDDLEWARE] },
    { kind: 'import', symbolName: 'JsonApprovalStore', fromModules: ['json-approval-store'], deny: [MIDDLEWARE] },
    { kind: 'import', symbolName: 'SqliteApprovalStore', fromModules: ['sqlite-approval-store'], deny: [MIDDLEWARE] },
  ]
})

// --- 4. evaluatePolicy() call restricted to middleware ---
// Policy evaluation must happen at the middleware interception point,
// not bypassed elsewhere.

export const evaluatePolicyOnlyInMiddleware = createRestrictedUsageCheck({
  name: 'guarded-wdk/evaluate-policy-only-in-middleware',
  packages: ALL_PACKAGES,
  rules: [{
    kind: 'function-call',
    functionName: 'evaluatePolicy',
    allow: [MIDDLEWARE]
  }]
})

// --- 5. Verifier store primitives only in verifier ---
// Nonce/revocation checks are part of the 6-step verification and
// must not be called outside approval-verifier.ts.

export const verifierPrimitivesOnlyInVerifier = createRestrictedUsageCheck({
  name: 'guarded-wdk/verifier-primitives-only-in-verifier',
  packages: ALL_PACKAGES,
  rules: [
    { kind: 'method-call', methodName: 'isSignerRevoked', allow: [VERIFIER] },
    { kind: 'method-call', methodName: 'getLastNonce', allow: [VERIFIER] },
    { kind: 'method-call', methodName: 'updateNonce', allow: [VERIFIER] },
  ]
})

// --- 6. Approval state mutations only in broker ---
// Pending approvals and history are part of the approval lifecycle
// and must not be mutated outside the broker.

export const approvalStateOnlyInBroker = createRestrictedUsageCheck({
  name: 'guarded-wdk/approval-state-only-in-broker',
  packages: ALL_PACKAGES,
  rules: [
    { kind: 'method-call', methodName: 'savePendingApproval', allow: [BROKER] },
    { kind: 'method-call', methodName: 'removePendingApproval', allow: [BROKER] },
    { kind: 'method-call', methodName: 'appendHistory', allow: [BROKER] },
  ]
})

// --- 7. verifyApproval must not be in public API ---
// Only broker should access the verifier. External packages must go
// through broker.submitApproval() which calls verifyApproval internally.

export const noPublicVerifierExport = createRestrictedUsageCheck({
  name: 'guarded-wdk/no-public-verifier-export',
  packages: ['guarded-wdk'],
  rules: [{
    kind: 'export',
    symbolName: 'verifyApproval',
    deny: [INDEX]
  }]
})
