# 작업위임서 — Store 타입 네이밍 통일

> Layer 0 Store 출력 타입을 `Stored*` 패턴으로 통일 + camelCase 전환

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: guarded-wdk, daemon 패키지

### What (무엇을)
- [ ] `JournalEntry` → `StoredJournal` rename (읽기 타입)
- [ ] `DeviceRecord` → `StoredDevice` rename + camelCase 전환 (snake_case → camelCase)
- [ ] `SeedRecord` → `StoredSeed` rename + camelCase 전환
- [ ] `StoredPolicy` camelCase 전환 (`seed_id` → `seedId` 등)
- [ ] store 구현체(json/sqlite)에서 row → camelCase 매핑 추가 (Device, Seed, Policy)
- [ ] daemon에서 snake_case 접근 → camelCase 전환
- [ ] index.ts export 업데이트

### When (언제)
- 선행 조건: v0.1.6 완료 (완료됨)
- 즉시 가능

### Where (어디서)
- `packages/guarded-wdk/src/approval-store.ts` — 타입 정의
- `packages/guarded-wdk/src/json-approval-store.ts` — 매핑 추가
- `packages/guarded-wdk/src/sqlite-approval-store.ts` — 매핑 추가
- `packages/guarded-wdk/src/index.ts` — export
- `packages/daemon/src/` — snake_case 접근 변경
- `packages/guarded-wdk/tests/` — assertion 변경

### Why (왜)
- 현재 Layer 0 네이밍이 불일치: `StoredCron`, `StoredPolicy`, `JournalEntry`, `DeviceRecord`, `SeedRecord` — 5가지 패턴
- `Stored*` 패턴 하나로 통일하면 "읽기 타입은 Stored*, 쓰기 타입은 *Input" 한 규칙으로 전체 이해 가능
- `DeviceRecord`/`SeedRecord`는 snake_case가 public API에 노출됨 (v0.1.6에서 CronRecord에 대해 수정한 것과 동일 문제)

### How (어떻게)
- `/codex-phase-workflow` 또는 `/quick-phase-workflow` 사용
- v0.1.6 Step 05 (CronRecord → CronRow + StoredCron) 패턴을 그대로 반복
  - store-types.ts에 `DeviceRow`, `SeedRow` 내부 타입 추가 (또는 기존 것 활용)
  - approval-store.ts에 `StoredDevice`, `StoredSeed` public camelCase 타입 정의
  - store 구현체에서 row → camelCase 매핑

최종 Layer 0 네이밍:

| Input (쓰기) | Stored (읽기) | 비고 |
|-------------|--------------|------|
| `PolicyInput` | `StoredPolicy` | camelCase 전환 |
| `CronInput` | `StoredCron` | 이미 완료 |
| `JournalInput` | `StoredJournal` | rename |
| (파라미터 2개) | `StoredDevice` | 신규 |
| (파라미터 2개) | `StoredSeed` | 신규 |

---

## 맥락

### 현재 상태
- 프로젝트 버전: v0.1.6 (완료, 태그됨)
- guarded-wdk 테스트: 161 passed, 6 suites
- daemon tsc: baseline 유지

### 사용자 확정 결정사항
- `Stored*` 패턴으로 통일 (사용자 합의)
- `JournalEntry` → `StoredJournal` (사용자 합의)
- `DeviceRecord`/`SeedRecord` camelCase 전환 (사용자 합의)
- Breaking Change 허용

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| v0.1.6 설계 | docs/archive/v0.1.6-layer0-type-cleanup/design.md | CronRow+StoredCron 패턴 참조 |
| v0.1.6 DoD | docs/archive/v0.1.6-layer0-type-cleanup/dod.md | DoD 스타일 참조 |
| Codex 토론 결과 | v0.1.6 Codex session round 2-3 | DeviceRecord/SeedRecord를 v0.1.7+로 미룬 근거 |

---

## 주의사항
- v0.1.6 Step 05와 동일 패턴이므로 구조 변경 없음, 이름+camelCase 전환만
- `HistoryEntry`는 Layer 2 (SignedApproval 참조)이므로 이번 scope 아님
- `HistoryQueryOpts`/`JournalQueryOpts`는 조회 필터 — 이번에 건드리지 않음

## 시작 방법
```bash
# Phase 디렉토리 생성
mkdir -p docs/phases/v0.1.7-store-naming

# Phase workflow 시작
# /codex-phase-workflow 또는 /quick-phase-workflow
```
