# 작업 티켓 - v0.2.4

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | WDK 타입 안전성 전체 리팩토링 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

없음 (단일 티켓)

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| WDK 로컬 타입 재정의 제거 | Step 01 | ✅ |
| unsafe cast 제거 | Step 01 | ✅ |
| tsc 통과 (cast 없이) | Step 01 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1-F8 | Step 01 | ✅ |
| N1-N4 | Step 01 | ✅ |
| E1-E3 | Step 01 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| @tetherto/wdk-wallet 의존성 추가 | Step 01 | ✅ |
| WalletEntry base 타입 (breaking change) | Step 01 | ✅ |
| GuardedAccount extends IWalletAccount | Step 01 | ✅ |
| createGuardedMiddleware 반환 타입 | Step 01 | ✅ |
| test-only cast 허용 | Step 01 | ✅ |

## Step 상세
- [Step 01: WDK 타입 안전성 전체 리팩토링](step-01-wdk-type-safety.md)

## 참고
기존 step-01-wdk-wallet-dep-and-factory.md와 step-02-middleware-type-compat.md는 단일 티켓으로 통합됨.
factory.ts의 `as any` 제거와 middleware.ts의 `GuardedAccount extends IWalletAccount` 변경은 서로 의존하여 중간 상태에서 tsc가 깨지므로, 단일 원자적 커밋이 필수.
