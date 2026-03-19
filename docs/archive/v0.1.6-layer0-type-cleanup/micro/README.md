# 작업 티켓 - v0.1.6

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | PolicyInput 분리 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | JournalEntry 분리 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | CronInput 정리 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | Pending 반환 타입 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | CronRow + StoredCron | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 (PolicyInput) ──┐
02 (JournalEntry) ─┼─ 독립 실행 가능
03 (CronInput) ────┘
        │
        ▼
04 (Pending 반환) ── 패턴 확립
        │
        ▼
05 (CronRow + StoredCron) ── 04와 동일 패턴
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. public API에서 @internal row 노출 제거 | Step 04, 05 | ✅ |
| 2. SignedPolicy 분리 | Step 01 | ✅ |
| 3. JournalEntry 분리 | Step 02 | ✅ |
| 4. CronRecord rename + StoredCron | Step 05 | ✅ |
| 5. CronInput optional 정리 | Step 03 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: PolicyInput rename | Step 01 | ✅ |
| F2: StoredPolicy 독립 | Step 01 | ✅ |
| F3: store 내부 JSON.stringify | Step 01 | ✅ |
| F4: CronInput 4필드 required | Step 03 | ✅ |
| F5: JournalInput 분리 | Step 02 | ✅ |
| F6: JournalInput 5필드 required | Step 02 | ✅ |
| F7: loadPendingByRequestId camelCase | Step 04 | ✅ |
| F8: CronRow + StoredCron | Step 05 | ✅ |
| F9: listCrons StoredCron[] | Step 05 | ✅ |
| F10: index.ts export | Step 01, 02, 05 | ✅ |
| N1: guarded-wdk test pass | Step 01-05 각각 | ✅ |
| N2: daemon tsc baseline | Step 01, 04, 05 | ✅ |
| N3: @internal 노출 없음 | Step 04, 05 | ✅ |
| N4: 입력 타입 optional 없음 | Step 01, 02, 03 | ✅ |
| N5: 구 타입명 잔존 없음 | Step 01, 05 | ✅ |
| E1: 빈 policies 배열 | Step 01 | ✅ |
| E2: chainId null round-trip | Step 03 | ✅ |
| E3: isActive boolean | Step 05 | ✅ |
| E4: CronStore StoredCron[] | Step 05 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| PolicyInput parsed + store 직렬화 | Step 01 | ✅ |
| JournalInput/JournalEntry 분리 | Step 02 | ✅ |
| CronRow + StoredCron | Step 05 | ✅ |
| loadPendingByRequestId → PendingApprovalRequest | Step 04 | ✅ |
| CronStore.listCrons any[] → StoredCron[] | Step 05 | ✅ |
| Breaking Change 허용 | Step 01-05 전체 | ✅ |

## Step 상세
- [Step 01: PolicyInput 분리](step-01-policy-input.md)
- [Step 02: JournalEntry 분리](step-02-journal-split.md)
- [Step 03: CronInput 정리](step-03-cron-input.md)
- [Step 04: Pending 반환 타입 변경](step-04-pending-return.md)
- [Step 05: CronRow + StoredCron](step-05-cron-public.md)
