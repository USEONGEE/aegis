# Micro Steps - v0.2.1

## 전체 현황

| Step | 설명 | 상태 | DoD 항목 |
|------|------|------|---------|
| 01 | 타입 정의 변경 | ⏳ | F1, F2, F3 |
| 02 | Store 구현체 수정 | ⏳ | F4, F5, N6 |
| 03 | 소비자 코드 수정 | ⏳ | F6, F7 |
| 04 | 테스트 수정 + 최종 검증 | ⏳ | N1-N5, E1-E3, F8 |

## 의존성

```
Step 01 (타입) → Step 02 (store) → Step 03 (소비자) → Step 04 (테스트 + 검증)
```

단일 커밋으로 일괄 수행. 검증은 Step 04에서 일괄.

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | Step |
|----------|------|
| StoredCron extends CronInput | 01 |
| StoredJournal extends JournalInput | 01 |
| StoredPolicy extends PolicyInput + 직렬화 캡슐화 | 01, 02, 03 |
| 타입 그래프에서 Stored → Input 의존 명시 | 04 (F8 검증) |

### DoD → 티켓

| DoD | Step |
|-----|------|
| F1, F2, F3 | 01 |
| F4, F5 | 02 |
| F6, F7 | 03 |
| F8 | 04 |
| N1, N2, N3, N4 | 04 |
| N5 | 04 |
| N6 | 02 |
| E1, E2, E3 | 04 |

### 설계 결정 → 티켓

| 설계 결정 | Step |
|----------|------|
| interface extends | 01 |
| store 내부 parse/stringify | 02 |
| PolicyInput 필드 이름 보존 | 01, 03 |
| store-types.ts PolicyRow 유지 | 02 (변경 안 함 확인) |
