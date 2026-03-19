# Layer 0 타입 정리 - v0.1.6

## 문제 정의

### 현상
guarded-wdk Layer 0 (leaf) 타입 13개에서 다음 문제가 발견됨:

1. **@internal 누수**: `PendingApprovalRow`, `CronRecord`가 `@internal` store-types.ts에 선언되었지만, `ApprovalStore` public API (`loadPendingByRequestId`, `listCrons`)가 이 타입을 그대로 반환
2. **SignedPolicy 표현 혼합**: parsed form (`policies`, `signature`)과 serialized form (`policies_json`, `signature_json`)이 한 타입에 섞여 있고, index signature `[key: string]: unknown`까지 존재
3. **JournalEntry 생성/저장 혼합**: 생성 시점 필수 필드와 저장 후 필드가 한 타입에 섞여 optional로 처리됨 (No Optional 원칙 위반)
4. **CronInput optional 필드**: `id?`, `chainId?` 등 생성 입력에 불필요한 optional 존재

### 원인
v0.1.4/v0.1.5에서 기능 구현에 집중하면서 타입 경계 정리가 후순위로 밀림. 특히:
- store 구현체 내부의 snake_case row 타입이 public API로 그대로 노출됨
- 생성 DTO와 저장 엔티티를 분리하지 않고 optional로 처리함

### 영향
- **daemon 등 소비자**: guarded-wdk internal row shape에 직접 의존 → 내부 변경 시 깨짐
- **No Optional 원칙 위반**: optional 필드가 런타임 null 체크를 요구하고 타입 안전성을 약화
- **신규 개발자 혼란**: `SignedPolicy`가 어떤 형태의 데이터인지 타입만 보고 판단 불가

### 목표
1. `ApprovalStore` public API에서 `@internal` row 타입 노출 제거
2. `SignedPolicy` 분리: 입력과 저장을 별도 타입으로
3. `JournalEntry` 분리: 생성 입력과 저장 결과를 별도 타입으로
4. `CronRecord` → `CronRow` rename + public `StoredCron` 타입 도입
5. `CronInput` optional 정리

### 비목표 (Out of Scope)
- `DeviceRecord`/`SeedRecord` camelCase 전환 (v0.1.7+)
- `VerificationContext` 네이밍 변경 (v0.1.7+)
- `TimestampPolicy` optional 제거 (v0.1.7+)
- `HistoryQueryOpts`/`JournalQueryOpts` 구조 변경 (v0.1.7+)
- `ArgCondition` 네이밍 정리 (v0.1.7+)
- policy 타입 파일 분리 (`policy-types.ts`) (v0.1.7+)

## Layer 0 전체 분류표

| # | 타입 | 위치 | 문제 | 이번 Phase | Defer 이유 |
|---|------|------|------|-----------|-----------|
| 1 | `ApprovalType` | approval-store.ts:6 | 없음 | 유지 | - |
| 2 | `ArgCondition` | guarded-middleware.ts:11 | 네이밍 약간 부정확 | 유지 | 기능에 영향 없음, 네이밍만의 문제 |
| 3 | `TimestampPolicy` | guarded-middleware.ts:34 | `validAfter?`/`validUntil?` optional | defer | 단독 타입이라 누수 없음 |
| 4 | `VerificationContext` | approval-verifier.ts:13 | 이름이 옵션에 가까움 | defer | 내부 함수 파라미터, API boundary 아님 |
| 5 | `DeviceRecord` | approval-store.ts:67 | snake_case public 노출 | defer | boundary 정책 먼저 확정 필요 |
| 6 | `SignedPolicy` | approval-store.ts:31 | **parsed/serialized 혼합** | **수정** | - |
| 7 | `CronInput` | approval-store.ts:77 | **optional 필드 과다** | **수정** | - |
| 8 | `SeedRecord` | approval-store.ts:86 | snake_case public 노출 | defer | DeviceRecord와 동일 |
| 9 | `JournalEntry` | approval-store.ts:94 | **생성/저장 혼합, optional** | **수정** | - |
| 10 | `PendingApprovalRow` | store-types.ts:7 | **public API에 @internal 누수** (`loadPendingByRequestId`) | **수정** (반환 타입 변경) | - |
| 11 | `CronRecord` | store-types.ts:32 | **public API에 @internal 누수** | **수정 → CronRow** | - |
| 12 | `HistoryQueryOpts` | approval-store.ts:107 | optional filter bag | defer | API 메서드 분리 필요, scope 큼 |
| 13 | `JournalQueryOpts` | approval-store.ts:114 | optional filter bag | defer | 동일 |

**수정 대상: 5개** (#6, #7, #9, #10, #11)
- #10: `loadPendingByRequestId` 반환 타입을 `PendingApprovalRow` → `PendingApprovalRequest`로 변경
- `CronInput.chainId` caller 필수화는 의도적 breaking change (daemon은 이미 항상 제공, 테스트는 수정 필요)

## Ownership Boundary (필드 책임)

| 타입 | 필드 | 책임 | 근거 |
|------|------|------|------|
| `CronInput` | `id` | **store** 생성 | store가 `randomUUID()`로 채움 |
| `CronInput` | `sessionId` | **caller** 필수 | daemon이 현재 세션 ID를 항상 제공 |
| `CronInput` | `interval`, `prompt` | **caller** 필수 | 사용자 입력 |
| `CronInput` | `chainId` | **caller** 필수 | daemon이 항상 제공 |
| `CronInput` | `createdAt` | **store** 생성 | store가 `Date.now()`로 채움 |
| `JournalEntry` | `intentId`, `seedId`, `chainId`, `targetHash`, `status` | **caller** 필수 | 실행 시점에 항상 알려진 값 |
| `JournalEntry` | `txHash` | **caller** 조건부 | 성공 시에만 존재 → 별도 타입 또는 `null` |
| `JournalEntry` | `createdAt`, `updatedAt` | **store** 생성 | store가 타임스탬프 관리 |

## 제약사항
- **Breaking Change 허용**: 프로젝트 원칙에 따라 적극 허용
- **No Optional**: 선택적 필드 금지, 필요하면 별도 타입 분리
- **Primitive First**: 최소 구현, 불필요한 추상화 금지
- **기존 테스트 통과**: `pnpm --filter guarded-wdk test` 기준 154 tests, 6 suites 전부 pass (2026-03-19 baseline)
