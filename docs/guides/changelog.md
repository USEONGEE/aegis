# Changelog

## v0.1.6 - Layer 0 타입 정리 (2026-03-19)

- **PolicyInput 도입**: `SignedPolicy` → `PolicyInput` rename. parsed form 입력, store가 직렬화 담당. `StoredPolicy` 독립 타입으로 분리
- **JournalEntry 분리**: `JournalInput`(생성 5필드 required) + `JournalEntry`(저장 8필드 required) — No Optional 원칙 준수
- **CronInput 정리**: `id`/`createdAt` 제거 (store 책임), `sessionId`/`chainId` required화
- **@internal 누수 차단**: `loadPendingByRequestId` → `PendingApprovalRequest` 반환, `listCrons` → `StoredCron[]` 반환
- **CronRow + StoredCron**: `CronRecord` → `CronRow` (internal) + `StoredCron` (public camelCase, `isActive: boolean`)
- **saveCron 반환 타입**: `void` → `string` (생성된 cron id 반환)
- **Breaking Change**: `SignedPolicy`, `CronRecord` 타입 제거, daemon snake_case 접근 전면 camelCase 전환

### 수치
- guarded-wdk: 161 tests, 6 suites pass
- 15 files changed, +281 -273
