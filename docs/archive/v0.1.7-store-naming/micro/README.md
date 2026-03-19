# 작업 티켓 - v0.1.7

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Row 내부 타입 추가 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | public 타입 재정의 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | store 구현체 매핑 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | daemon camelCase 전환 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | 테스트 수정 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 (Row types) → 02 (public types) → 03 (store mapping)
                                   → 04 (daemon) [Step 02, 03 이후]
                                   → 05 (tests) [Step 02, 03 이후]
```

실행 순서: 01 → 02 → 03 → 04 + 05 (04와 05는 병렬 가능)

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 모든 Store 읽기 타입을 `Stored*` 패턴으로 통일 | Step 02 | ✅ |
| 모든 public 타입을 camelCase로 전환 | Step 02, 03 | ✅ |
| snake_case는 `@internal` Row 타입에만 남김 | Step 01, 03 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: JournalEntry → StoredJournal | Step 02 | ✅ |
| F2: DeviceRecord → StoredDevice | Step 02 | ✅ |
| F3: SeedRecord → StoredSeed | Step 02 | ✅ |
| F4: StoredPolicy camelCase | Step 02 | ✅ |
| F5: DeviceRow, SeedRow, PolicyRow 추가 | Step 01 | ✅ |
| F6: json store 매핑 | Step 03 | ✅ |
| F7: sqlite store 매핑 | Step 03 | ✅ |
| F8: index.ts export | Step 02 | ✅ |
| F9: daemon snake_case 전환 | Step 04 | ✅ |
| F10: daemon any 제거 | Step 04 | ✅ |
| F11: JSON wrapper 타입 변경 | Step 03 | ✅ |
| N1: guarded-wdk test pass | Step 05 | ✅ |
| N2: public 타입 snake_case 없음 | Step 02 | ✅ |
| N3: @internal JSDoc 유지 | Step 01 | ✅ |
| E1: SQLite round-trip | Step 03, 05 | ✅ |
| E2: JSON round-trip | Step 03, 05 | ✅ |
| E3: isActive boolean 변환 | Step 03, 05 | ✅ |
| E4: daemon policy 접근 | Step 04 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| TD-1: JSON on-disk snake_case 유지 | Step 03 | ✅ |
| TD-2: DeviceRow + StoredDevice | Step 01, 02, 03 | ✅ |
| TD-3: SeedRow + StoredSeed | Step 01, 02, 03 | ✅ |
| TD-4: StoredJournal rename | Step 02, 03 | ✅ |
| TD-5: PolicyRow + StoredPolicy camelCase | Step 01, 02, 03 | ✅ |
| TD-6: daemon any 제거 + 타입 좁히기 | Step 04 | ✅ |
| TD-7: JSON wrapper 타입 변경 | Step 03 | ✅ |
| TD-8: ApprovalStore 시그니처 | Step 02 | ✅ |

## Step 상세
- [Step 01: Row 내부 타입 추가](step-01-row-types.md)
- [Step 02: public 타입 재정의](step-02-public-types.md)
- [Step 03: store 구현체 매핑](step-03-store-mapping.md)
- [Step 04: daemon camelCase 전환](step-04-daemon.md)
- [Step 05: 테스트 수정](step-05-tests.md)
