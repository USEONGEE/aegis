# 작업 티켓 - v0.1.4 타입 시스템 리팩토링

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | permissions 딕셔너리 (Change 8) | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | chainId: number (Change 5) | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | camelCase 통일 (Change 1) | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | countersig 제거 (Change 7) | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | PendingRequest 분리 (Change 3) | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | FIFO queue (Change 2) | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 07 | pending 취소 (Change 4) | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 08 | signTransaction (Change 6) | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04 → 05 → 06 → 07
                                  ↘
                           05 → 08
```

- 01~07: 엄격한 순차 의존
- 08: Step 05 이후 독립 (06/07과 병렬 가능하지만, 순차 실행 권장)

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. camelCase/snake_case 통일 | Step 03 | ✅ |
| 2. daemon FIFO queue | Step 06 | ✅ |
| 3. PendingRequest 분리 | Step 05 | ✅ |
| 4. pending message 취소 | Step 07 | ✅ |
| 5. chainId: number 통일 | Step 02 | ✅ |
| 6. signTransaction 분리 | Step 08 | ✅ |
| 7. wdk_countersig 제거 | Step 04 | ✅ |
| 8. permissions 딕셔너리 | Step 01 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F3 (PermissionDict) | Step 01 | ✅ |
| F4~F6, F14~F15 (chainId) | Step 02 | ✅ |
| F7~F9 (camelCase) | Step 03 | ✅ |
| F10~F11 (countersig) | Step 04 | ✅ |
| F12~F13 (PendingRequest) | Step 05 | ✅ |
| F16~F19 (FIFO queue) | Step 06 | ✅ |
| F20~F23, F27~F28 (cancel + ack) | Step 07 | ✅ |
| F24~F26 (signTransaction) | Step 08 | ✅ |
| N1 (tsc per-package) | Step 08 (최종 확인) | ✅ |
| N2 (npm test) | Step 08 (최종 확인) | ✅ |
| N3 (app tsc) | Step 02 (app 변경 포함) | ✅ |
| N4 (CI check) | Step 08 (최종 확인) | ✅ |
| N5 (SQLite chain_id) | Step 02 | ✅ |
| N6 (JSON Store key) | Step 02 | ✅ |
| N7 (type-dep-graph) | Step 08 (최종 확인) | ✅ |
| E1~E2 (wildcard order) | Step 01 | ✅ |
| E3 (unknown chain) | Step 02 | ✅ |
| E4~E6 (queue/cancel) | Step 06, 07 | ✅ |
| E7~E8 (signTransaction) | Step 08 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. PermissionDict 키 형식 | Step 01 | ✅ |
| 2. Rule.order 순서 보존 | Step 01 | ✅ |
| 3. chainId: number (EVM) | Step 02 | ✅ |
| 4. daemon tool-surface 단일 변환 | Step 02 | ✅ |
| 5. camelCase 변환 위치 (Store 내부) | Step 03 | ✅ |
| 6. Stored* 타입 private | Step 03 | ✅ |
| 7. In-memory FIFO queue | Step 06 | ✅ |
| 8. signTransaction 호출 경로 | Step 08 | ✅ |
| 9. cancel 메시지 계약 | Step 07 | ✅ |

## Step 상세
- [Step 01: permissions 딕셔너리](step-01-permissions-dict.md)
- [Step 02: chainId: number](step-02-chainid-number.md)
- [Step 03: camelCase 통일](step-03-camelcase.md)
- [Step 04: countersig 제거](step-04-countersig-removal.md)
- [Step 05: PendingRequest 분리](step-05-pending-split.md)
- [Step 06: FIFO queue](step-06-fifo-queue.md)
- [Step 07: pending 취소](step-07-pending-cancel.md)
- [Step 08: signTransaction](step-08-sign-transaction.md)
