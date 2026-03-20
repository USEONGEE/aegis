# 작업 티켓 - v0.2.6

## 전체 현황

| # | Step | 난이도 | 롤백 | 개발 | 완료일 |
|---|------|--------|------|------|--------|
| 01 | Daemon 타입 경계 정합성 복원 (전체) | 🔴 | ✅ | ⏳ | - |

## 의존성
없음 (단일 티켓, 단일 원자적 커밋)

## 커버리지 매트릭스

### PRD 목표 → 티켓
| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| shadow interface 제거 | F1,F3,F5,F6,F7,F8,F13 | ✅ |
| guarded-wdk 경계 tsc 에러 0건 | N1 | ✅ |
| relay event 정합 | F9,F10 | ✅ |
| v0.2.5 잔재 cleanup | N3 | ✅ |

### DoD → 티켓
모든 DoD 항목 (F1-F13, N1-N3, E1-E2) → Step 01

## Step 상세
- [Step 01: Daemon 타입 경계 정합성 복원](step-01-boundary-normalization.md)
