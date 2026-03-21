# 작업 티켓 - v0.3.3

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Relay 오프라인 Cron Backfill 통합 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성
없음 (단일 티켓)

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| chatCursors 파싱 + per-session backfill | Step 01 (F4, F5) | ✅ |
| subscribe_chat 핸들러 + backfill | Step 01 (F6, F7) | ✅ |
| end-to-end 오프라인 cron 복구 | Step 01 (F9) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F9 | Step 01 | ✅ |
| N1~N2 | Step 01 | ✅ |
| E1~E3 | Step 01 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| XRANGE 기반 readRange | Step 01 (F1, F2) | ✅ |
| backfillChatStream(startId) | Step 01 (F3, F8) | ✅ |
| inclusive-start + idempotent | Step 01 (E3) | ✅ |
| one-shot (no loop) | Step 01 (F8) | ✅ |
| subscribe_chat 재호출 idempotent | Step 01 (F6, F7) | ✅ |

## Step 상세
- [Step 01: Relay 오프라인 Cron Backfill 통합](step-01-relay-backfill.md)
