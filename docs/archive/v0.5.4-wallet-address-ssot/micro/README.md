# 작업 티켓 - v0.5.4

## 전체 현황

| # | Step | 난이도 | 롤백 | 개발 | 완료일 |
|---|------|--------|------|------|--------|
| 01 | 타입 + 스키마에서 address 제거 | 🟡 | ✅ | ⏳ | - |
| 02 | daemon 참조 수정 + 테스트 업데이트 | 🟡 | ✅ | ⏳ | - |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| wallets 테이블에서 address 컬럼 제거 | Step 01 | ✅ |
| createWallet() 시그니처에서 address 제거 | Step 01 | ✅ |
| StoredWallet 타입에서 address 제거 | Step 01 | ✅ |
| DB는 account_index만 관리 | Step 01 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: wallets 테이블에 address 없음 | Step 01 | ✅ |
| F2: StoredWallet에 address 없음 | Step 01 | ✅ |
| F3: WalletRow에 address 없음 | Step 01 | ✅ |
| F4: createWallet 2개 파라미터 | Step 01 | ✅ |
| F5: admin-server address 없음 | Step 02 | ✅ |
| N1: tsc 통과 | Step 01, 02 | ✅ |
| N2: 테스트 통과 | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| SQLite 테이블 재생성 | Step 01 | ✅ |
| WalletRow 타입 수정 | Step 01 | ✅ |
| daemon admin-server 수정 | Step 02 | ✅ |
| 테스트 수정 | Step 02 | ✅ |

## Step 상세
- [Step 01: 타입 + 스키마에서 address 제거](step-01-types-schema.md)
- [Step 02: daemon 참조 수정 + 테스트 업데이트](step-02-daemon-tests.md)
