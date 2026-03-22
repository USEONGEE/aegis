# 작업 티켓 — v0.4.6 Store 경계 분리

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | WdkStore 추출 + rename | 🟠 중간 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | DaemonStore 추출 + SqliteDaemonStore | 🟡 보통 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | Rejection 내부화 | 🟠 중간 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | Journal 내부화 | 🔴 어려움 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | Facade 확장 + store/broker 제거 | 🔴 어려움 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | CI 경계 체크 + DB 분리 | 🟡 보통 | ✅ | ✅ | ✅ | ⏳ | - |
| 07 | 정리 + 테스트 보강 | 🟠 중간 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 ──→ 02
01 ──→ 03 ──→ 04
01 + 03 + 04 ──→ 05 ──→ 06 ──→ 07
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. ApprovalStore → WdkStore + DaemonStore 분리 | Step 01, 02 | ✅ |
| 2. WDK 내부화 (rejection, journal) | Step 03, 04 | ✅ |
| 3. facade 경유 강제 | Step 05 | ✅ |
| 4. DaemonStore 최소화 (cron만) | Step 02 | ✅ |
| 5. Runtime import 경계 강제 | Step 06 | ✅ |
| 6. 런타임 DB 분리 | Step 02, 06 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: ApprovalStore 삭제 + WdkStore 대체 | Step 01 | ✅ |
| F2: SqliteApprovalStore/JsonApprovalStore rename | Step 01 | ✅ |
| F3: DaemonStore interface 정의 | Step 02 | ✅ |
| F4: SqliteDaemonStore 별도 DB | Step 02 | ✅ |
| F5: Rejection middleware 내부화 | Step 03 | ✅ |
| F6: daemon rejection 코드 제거 | Step 03 | ✅ |
| F7: ExecutionJournal guarded-wdk 이동 | Step 04 | ✅ |
| F8: dedupKey 기반 dedup | Step 04 | ✅ |
| F9: PolicyRejectionError intentHash | Step 03 | ✅ |
| F10: getApprovalStore/getBroker 제거 | Step 05 | ✅ |
| F11: facade 읽기 메서드 7개 | Step 05 | ✅ |
| F12: facade broker 흡수 메서드 3개 | Step 05 | ✅ |
| F13: WDKInitResult 단일 facade | Step 05 | ✅ |
| F14: dedupKey() 함수 추가 | Step 03 | ✅ |
| F15: targetHash → dedupKey rename | Step 03, 04, 07 | ✅ |
| N1: TypeScript 컴파일 성공 | Step 07 | ✅ |
| N2: 신규 CI 체크 PASS | Step 06 | ✅ |
| N3: daemon runtime import 0건 | Step 06 | ✅ |
| N4: getApprovalStore/getBroker 호출 0건 | Step 06 | ✅ |
| N5: 별도 SQLite 파일 | Step 02, 06 | ✅ |
| N6: pino 의존 없음 | Step 04 | ✅ |
| N7: 전체 테스트 통과 | Step 07 | ✅ |
| E1: onRejection 실패 → 에러는 throw | Step 03 | ✅ |
| E2: journal null → 정상 동작 | Step 04 | ✅ |
| E3: seed 없음 → facade null | Step 05 | ✅ |
| E4: 동일 dedupKey 중복 방지 | Step 04 | ✅ |
| E5: deleteWallet cron 무관 | Step 07 | ✅ |
| E6: Json store 파일 격리 | Step 07 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| WdkStore abstract class (32 메서드) | Step 01 | ✅ |
| DaemonStore interface (6 메서드) | Step 02 | ✅ |
| Rejection onRejection 콜백 | Step 03 | ✅ |
| ExecutionJournal guarded-wdk 이동 | Step 04 | ✅ |
| dedupKey/intentHash 분리 | Step 03, 04 | ✅ |
| PolicyRejectionError intentHash | Step 03 | ✅ |
| Facade 메서드 통합 (10개) | Step 05 | ✅ |
| WDKInstance + Facade 단일 객체 | Step 05 | ✅ |
| CI runtime import 차단 | Step 06 | ✅ |
| 별도 SQLite 파일 | Step 02, 06 | ✅ |
| JournalLogger (pino 회피) | Step 04 | ✅ |
| DB 폐기 정책 | Step 03, 04 (rename 자유) | ✅ |

## Step 상세
- [Step 01: WdkStore 추출 + rename](step-01-wdkstore-extract.md)
- [Step 02: DaemonStore 추출 + SqliteDaemonStore](step-02-daemonstore-extract.md)
- [Step 03: Rejection 내부화](step-03-rejection-internalize.md)
- [Step 04: Journal 내부화](step-04-journal-internalize.md)
- [Step 05: Facade 확장 + store/broker 제거](step-05-facade-expand.md)
- [Step 06: CI 경계 체크 + DB 분리](step-06-ci-boundary.md)
- [Step 07: 정리 + 테스트 보강](step-07-cleanup.md)
