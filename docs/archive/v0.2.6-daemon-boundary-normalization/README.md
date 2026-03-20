# Daemon 타입 경계 정합성 복원 - v0.2.6

## 문제 정의

### 현상
- daemon이 guarded-wdk의 shared public 타입을 직접 import하지 않고, 로컬 shadow interface(`WDKInstance`, broker/store 로컬 타입)를 유지
- v0.1.7~v0.2.5의 guarded-wdk 대규모 리팩토링 동안 shadow interface가 업데이트되지 않아 타입 drift 축적
- daemon `npx tsc --noEmit` 실패 — guarded-wdk 경계 관련 compile blocker:
  - `WDKInstance`/`GuardedWDKFacade` 시그니처 충돌 (`getFeeRates` 등)
  - `SignedApprovalBroker` 로컬 shadow와 실제 타입 불일치 (`submitApproval` 시그니처)
- 정리할 residue:
  - relay event drift (daemon만: `ApprovalGranted`, guarded-wdk만: `TransactionSigned`/`WalletCreated`/`WalletDeleted`)
  - `tx_approval` 테스트 잔재

### 원인
- daemon이 guarded-wdk의 public export 타입 대신 자체 정의한 로컬 인터페이스를 사용
- v0.2.4에서 `GuardedWDKFacade` 반환 타입이 정밀화(`unknown` → `IWalletAccountWithProtocols`, `FeeRates`)되었으나 daemon의 `WDKInstance`는 미갱신
- `SignedApprovalBroker.submitApproval` 시그니처가 `Record<string, unknown>` → `SignedApproval` + `VerificationContext`로 변경되었으나 daemon shadow가 미반영
- v0.2.5 Decision 단순화 후 남은 잔재 (`tx_approval` 테스트, `pending_approval` 코멘트, dead relay event)

### 영향
- daemon tsc 실패 — CI/CD 타입 체크 불가
- guarded-wdk 타입 변경 시 daemon에서 컴파일 타임 감지 불가 (shadow interface가 drift 숨김)
- relay event drift로 클라이언트가 실제 발생하는 이벤트를 못 받음

### 목표
- daemon의 로컬 shadow interface를 제거하고 guarded-wdk public export 타입에 직접 의존
- daemon의 guarded-wdk 경계 관련 tsc 에러 0건 달성
- relay event 목록을 guarded-wdk 실제 emit과 정합
- v0.2.5 잔재 cleanup (tx_approval 테스트, stale relay event)

### 비목표 (Out of Scope)
- getBalance 계약 drift (upstream `Promise<bigint>` vs daemon 배열 가정) — 별도 Phase
- pino ESM import, OpenAI SDK overload, relay payload typing — 별도 chore
- guarded-wdk 코드 변경
- v0.2.0 멀티월렛 실제 연동 (wallets: {} 빈 객체 패턴 유지)

## 제약사항
- daemon만 변경 (guarded-wdk는 변경 없음)
- guarded-wdk public export에서만 타입 import (internal path 금지)
- facade 타입은 type-only import `typeof import('@wdk-app/guarded-wdk').createGuardedWDK` 기반으로 derive (GuardedWDKFacade가 비공개이므로, runtime lazy-load와 충돌 방지)
- daemon 기존 테스트 통과 필수
- `_trustedApprovers` 같은 private 필드 접근 제거 → `store.listSigners()` + `setTrustedApprovers()` 패턴으로 대체
- mock WDK fallback(`createMockWDK`) 유지 — derived boundary type에 맞춰 타입 정렬
