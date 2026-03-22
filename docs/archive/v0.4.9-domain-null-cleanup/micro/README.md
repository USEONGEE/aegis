# 작업 티켓 - v0.4.9

## 전체 현황

| # | Step | 난이도 | 롤백 | 선행 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|------|-------|-------|------|--------|
| 01 | Dead field + VerificationTarget DU | 🟢 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 02 | Default value conversions | 🟡 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 03 | Filter param consolidation | 🟡 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 04 | History null removal | 🟡 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 05 | Cron ChainScope DU | 🟠 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 06 | EvaluationResult DU | 🔴 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 07 | Signer Status DU | 🟠 | ✅ | 02 | ✅ | ✅ | ⏳ | - |
| 08 | App ApprovalRequest DU | 🟡 | ✅ | - | ✅ | ✅ | ⏳ | - |
| 09 | Tool result null cleanup | 🟠 | ✅ | - | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 ──────────────────────> (독립)
02 ──────────────────────> (독립) ──→ 07 (name non-null 선행)
03 ──────────────────────> (독립)
04 ──────────────────────> (독립)
05 ──────────────────────> (독립)
06 ──────────────────────> (독립, 1-5 완료 후 권장)
07 ─── depends on 02 ───>
08 ──────────────────────> (독립, App only)
09 ──────────────────────> (독립)
```

권장 순서: 01-04 (warm-up) → 05 → 06 (핵심) → 07-09

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 도메인 모델 `\| null` ~38건 제거 | Step 01~09 전체 | ✅ |
| Dead 필드 삭제 (currentPolicyVersion) | Step 01 | ✅ |
| expectedTargetHash DU 전환 | Step 01 | ✅ |
| 패턴 확립 (일관된 해결 방식) | Step 01 (삭제+DU), 02 (기본값), 03 (filter), 04 (null 제거), 05-08 (DU), 09 (strict화) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 (VerificationTarget DU, currentPolicyVersion 삭제) | Step 01 | ✅ |
| F2 (walletName non-null) | Step 02 | ✅ |
| F3 (StoredSigner.name non-null) | Step 02 | ✅ |
| F4 (NullLogger) | Step 02 | ✅ |
| F5 (PendingApprovalFilter) | Step 03 | ✅ |
| F6 (CronFilter) | Step 03 | ✅ |
| F7 (HistoryEntry null 제거) | Step 04 | ✅ |
| F8 (ChainScope DU) | Step 05 | ✅ |
| F9a (EvaluationResult DU) | Step 06 | ✅ |
| F9b (protocol wire 변경) | Step 06 | ✅ |
| F9c (daemon emit) | Step 06 | ✅ |
| F9d (app consumer) | Step 06 | ✅ |
| F10 (SignerStatus DU) | Step 07 | ✅ |
| F11 (App ApprovalRequest DU) | Step 08 | ✅ |
| F12 (tool result non-null) | Step 09 | ✅ |
| N1 (tsc --noEmit) | Step 01~09 각각 | ✅ |
| N2 (기존 테스트 통과) | Step 01~09 각각 | ✅ |
| N3 (store-types.ts 불변) | Step 02, 04 | ✅ |
| N4 (never guard) | Step 05, 06 | ✅ |
| N5 (getStatus 삭제) | Step 01 | ✅ |
| E1 (wallet_name NULL row) | Step 02 | ✅ |
| E2 (signed_approval_json NULL row) | Step 04 | ✅ |
| E3 (chain_id NULL row) | Step 04 | ✅ |
| E4 (revoked_at NULL row) | Step 07 | ✅ |
| E5 (SimpleRejectResult) | Step 06 | ✅ |
| E6 (DetailedRejectResult) | Step 06 | ✅ |
| E7 (Cron chainId 미지정) | Step 05 | ✅ |
| E8 (device_revoke 외 targetPublicKey 없음) | Step 08 | ✅ |
| E9 (빈 PendingApprovalFilter) | Step 03 | ✅ |
| E10 (빈 CronFilter) | Step 03 | ✅ |
| E11 (ToolAccount hash/fee non-null) | Step 09 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| DU discriminant: `kind` 필드 | Step 01, 05, 06, 07 | ✅ |
| Filter 파라미터: optional property 허용 | Step 03 | ✅ |
| DB Row 타입 null 유지 | Step 02, 04, 05, 07 (store 변환) | ✅ |
| exhaustiveness check: `never` 가드 | Step 05, 06 | ✅ |
| wire breaking change 허용 | Step 06 (protocol) | ✅ |

**커버리지: PRD 4/4, DoD 27/27, 설계 결정 5/5 = 100%**

## Step 상세
- [Step 01: Dead Field + VerificationTarget DU](step-01-dead-field-cleanup.md)
- [Step 02: Default Value Conversions](step-02-default-values.md)
- [Step 03: Filter Param Consolidation](step-03-filter-params.md)
- [Step 04: History Null Removal](step-04-history-null.md)
- [Step 05: Cron ChainScope DU](step-05-chain-scope.md)
- [Step 06: EvaluationResult DU](step-06-evaluation-result.md)
- [Step 07: Signer Status DU](step-07-signer-status.md)
- [Step 08: App ApprovalRequest DU](step-08-app-approval-du.md)
- [Step 09: Tool Result Null Cleanup](step-09-tool-result.md)
