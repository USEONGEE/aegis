# Micro Steps - v0.2.7

## 전체 현황

| Step | 설명 | 상태 | DoD 항목 |
|------|------|------|---------|
| 01 | 타입 변경 | ⏳ | F1, F2, F3, F4, F5 |
| 02 | Verifier + Broker | ⏳ | F6, F7 |
| 03 | Store 구현체 | ⏳ | F8, N4 |
| 04 | Daemon | ⏳ | F9, F10 |
| 05 | App | ⏳ | F11, F12, F13, F14 |
| 06 | 테스트 + 검증 | ⏳ | N1, N2, N3, N5, E1, E2, E3 |

## 의존성

```
Step 01 (타입) → Step 02 (verifier/broker)
Step 01 → Step 03 (store)
Step 01 → Step 04 (daemon)
Step 01 → Step 05 (app)
Step 01-05 → Step 06 (테스트)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | Step |
|----------|------|
| SignedApproval signerId 제거 | 01, 02, 05 |
| StoredSigner publicKey PK | 01, 03 |
| nonce 단일키 | 01, 02, 03 |
| HistoryEntry signerId 제거 | 01, 03 |
| App 정리 | 05 |

### DoD → 티켓

| DoD | Step |
|-----|------|
| F1, F2, F3, F4, F5 | 01 |
| F6, F7 | 02 |
| F8, N4 | 03 |
| F9, F10 | 04 |
| F11, F12, F13, F14 | 05 |
| N1, N2, N3, N5, E1, E2, E3 | 06 |

### 설계 결정 → 티켓

| 설계 결정 | Step |
|----------|------|
| signerId 제거 | 01, 02, 03, 04, 05 |
| publicKey PK | 01, 03 |
| nonce 단일키 | 01, 02, 03 |
| device_revoke SHA-256(폐기 대상 publicKey) | 04, 05 |
| name nullable + 축약 fallback | 05 |
| clean install | 03, 06(N4) |
