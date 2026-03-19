# Store 타입 네이밍 통일 - v0.1.7

## 문제 정의

### 현상
Layer 0 Store 출력(읽기) 타입의 네이밍이 불일치한다:

| 현재 이름 | 패턴 | 케이스 |
|-----------|------|--------|
| `StoredCron` | Stored* | camelCase ✅ |
| `StoredPolicy` | Stored* | snake_case ❌ |
| `JournalEntry` | *Entry | camelCase ✅ |
| `DeviceRecord` | *Record | snake_case ❌ |
| `SeedRecord` | *Record | snake_case ❌ |

5개 타입에 3가지 네이밍 패턴(`Stored*`, `*Entry`, `*Record`)과 2가지 케이스(camelCase, snake_case)가 혼재한다.

### 원인
- 초기 구현 시 일괄 네이밍 규칙 없이 각 도메인별로 개별 정의
- v0.1.6에서 `CronRecord → StoredCron` 패턴을 적용했으나 Device, Seed, Journal, Policy는 미적용
- `DeviceRecord`/`SeedRecord`는 SQLite 컬럼 이름(snake_case)이 그대로 public API에 노출

### 영향
- **API 소비자 혼란**: 읽기 타입이 `Stored*`인지 `*Record`인지 `*Entry`인지 추측해야 함
- **snake_case 누수**: `DeviceRecord.device_id`, `SeedRecord.created_at`, `StoredPolicy.seed_id` 등 내부 구현이 public API에 노출
- **규칙 학습 비용**: "읽기 타입은 Stored*, 쓰기 타입은 *Input" 한 규칙으로 정리 불가

### 목표
- 모든 Store 읽기 타입을 `Stored*` 패턴으로 통일
- 모든 public 타입을 camelCase로 전환
- snake_case는 `@internal` Row 타입(store-types.ts)에만 남김

최종 목표 상태:

| 쓰기 API | Stored (읽기) | 비고 |
|----------|--------------|------|
| `PolicyInput` | `StoredPolicy` | camelCase 전환 |
| `CronInput` | `StoredCron` | 이미 완료 (v0.1.6) |
| `JournalInput` | `StoredJournal` | rename |
| 파라미터 2개 (유지) | `StoredDevice` | rename + camelCase |
| 파라미터 2개 (유지) | `StoredSeed` | rename + camelCase |

> 저장 결과 타입을 `Stored*`로 통일. 기존 write API shape는 유지.

### 비목표 (Out of Scope)
- `HistoryEntry`: Layer 2 타입 (SignedApproval 참조), 이번 scope 아님
- `HistoryQueryOpts`/`JournalQueryOpts`: 조회 필터 타입, 변경 없음
- `PendingApprovalRequest`: 이미 camelCase, 변경 없음
- DB 스키마 변경: snake_case 컬럼은 유지 (Row 타입이 매핑)

## 제약사항
- Breaking change 허용 (프로젝트 원칙)
- v0.1.6 패턴(CronRow + StoredCron) 그대로 반복
- daemon 패키지의 snake_case 프로퍼티 접근도 함께 전환 필요
