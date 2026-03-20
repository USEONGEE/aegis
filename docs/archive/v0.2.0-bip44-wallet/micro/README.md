# 작업 티켓 - v0.2.0

## 전체 현황

| # | Step | 난이도 | 롤백 | 개발 | 완료일 |
|---|------|--------|------|------|--------|
| 01 | Layer 0 타입 재설계 | 🟡 | ✅ | ⏳ | - |
| 02 | ApprovalStore 인터페이스 + 구현체 | 🔴 | ✅ | ⏳ | - |
| 03 | SignedApprovalBroker + ApprovalVerifier | 🟠 | ✅ | ⏳ | - |
| 04 | canonical intentHash timestamp | 🟢 | ✅ | ⏳ | - |
| 05 | guarded-middleware 연동 | 🟡 | ✅ | ⏳ | - |
| 06 | daemon 전면 연동 | 🔴 | ✅ | ⏳ | - |
| 07 | app 최소 연동 | 🟠 | ✅ | ⏳ | - |

## 의존성

```
01 ──→ 02 ──→ 03 ──→ 05 ──→ 06 ──→ 07
                      ↑
04 ───────────────────┘
```

Step 04(canonical)은 독립적이며 01과 병렬 가능. Step 05에서 합류.

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 니모닉 1개 + BIP-44 파생 계정 N개 | 01, 02 | ✅ |
| AI가 accountIndex로 지갑 지정 | 01, 06 | ✅ |
| 지갑 생명주기를 Unified SignedApproval로 통합 | 01, 02, 03 | ✅ |
| metadata 제거 → 정규 필드 + content | 01, 03, 06, 07 | ✅ |
| intentId 제거 → intentHash PK | 04, 05, 06 | ✅ |
| 기존 데이터 파기 (clean install) | 02 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 (MasterSeed 1개) | 01, 02 | ✅ |
| F2 (StoredWallet CRUD) | 01, 02 | ✅ |
| F3 (seed 메서드 6개 제거) | 02 | ✅ |
| F4 (seedId→accountIndex) | 01, 02, 03, 06 | ✅ |
| F5a (wallet_create/delete 추가) | 01 | ✅ |
| F5b (device_revoke 유지) | 01, 06, 07 | ✅ |
| F6 (broker wallet_create) | 03 | ✅ |
| F7 (broker wallet_delete cascade) | 02, 03 | ✅ |
| F8a (guarded-wdk metadata 제거) | 01, 03 | ✅ |
| F8b (daemon metadata 제거) | 06 | ✅ |
| F8c (app metadata 제거) | 07 | ✅ |
| F8d (app content/wallet 표시) | 07 | ✅ |
| F9 (intentHash timestamp) | 04 | ✅ |
| F10 (intentId 제거) | 05, 06 | ✅ |
| F11 (WDKContext.seedId 제거) | 06 | ✅ |
| F12 (도구 accountIndex) | 06 | ✅ |
| F13 (ExecutionJournal seedId 제거) | 06 | ✅ |
| F14 (CronScheduler seedId 제거) | 06 | ✅ |
| F15 (daemon boot 변경) | 06 | ✅ |
| F16 (pending_requests FK 없음) | 02 | ✅ |
| F17 (admin-server wallet API) | 06 | ✅ |
| N1 (guarded-wdk tsc) | 02, 05 | ✅ |
| N2 (daemon tsc) | 06 | ✅ |
| N3 (canonical tsc) | 04 | ✅ |
| N4 (guarded-wdk test) | 02, 05 | ✅ |
| N5 (daemon test) | 06 | ✅ |
| N6 (순환 의존 0) | 05 | ✅ |
| N7 (clean install) | 06 | ✅ |
| E1 (미등록 accountIndex) | 06 | ✅ |
| E2 (MasterSeed 미설정) | 06 | ✅ |
| E3 (중복 wallet_create) | 02 | ✅ |
| E4 (pending 있는 wallet_delete) | 02 | ✅ |
| E5 (intentHash 충돌) | 04 | ✅ |
| E6 (삭제 후 history 보존) | 02, 03 | ✅ |
| E7 (setMasterSeed 2회) | 02 | ✅ |
| E8 (wallet 삭제 후 재생성) | 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| accountIndex(BIP-44 정수) | 01, 02, 06 | ✅ |
| MasterSeed 테이블 (row 1개) | 02 | ✅ |
| wallet_delete hard cascade | 02, 03 | ✅ |
| pending_requests FK 없음 | 02 | ✅ |
| intentHash에 timestamp | 04 | ✅ |
| device_revoke 명칭 유지 | 01, 06, 07 | ✅ |
| wallet_name 단일 진실 원천 | 02, 03 | ✅ |
| metadata 전면 제거 | 01, 03, 06, 07 | ✅ |

## Step 상세
- [Step 01: Layer 0 타입 재설계](step-01-types.md)
- [Step 02: ApprovalStore 인터페이스 + 구현체](step-02-store.md)
- [Step 03: SignedApprovalBroker](step-03-broker.md)
- [Step 04: canonical intentHash](step-04-canonical.md)
- [Step 05: guarded-middleware 연동](step-05-middleware.md)
- [Step 06: daemon 전면 연동](step-06-daemon.md)
- [Step 07: app 최소 연동](step-07-app.md)
