# 작업 티켓 - v0.1.9

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | guarded-wdk types + API + store | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | guarded-wdk broker + tests | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | daemon + tests | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | app shared contract + protocol | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04
         ↑ 같은 PR ↑
```

**제약**: Step 03과 04는 동일 PR/release로 묶어야 함 (D1)

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| Device 네이밍 → Signer 일반화 | Step 01~04 전체 | ✅ |
| 공유 계약 변경 (SignedApproval + app) | Step 01, 04 | ✅ |
| DB 스키마 변경 | Step 01 | ✅ |
| 향후 확장을 막지 않는 네이밍 | Step 01~04 전체 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: StoredDevice/DeviceRevokedError rename | Step 01 | ✅ |
| F2: 메서드 5개 rename | Step 01 | ✅ |
| F3: SignedApproval.signerId | Step 01 (정의), 04 (app) | ✅ |
| F4: HistoryEntry.signerId | Step 01 | ✅ |
| F5: SignerRow rename | Step 01 | ✅ |
| F6: registeredAt rename | Step 01 | ✅ |
| F7: SQLite signers 테이블 | Step 01 | ✅ |
| F8: signers.json | Step 01 | ✅ |
| F9: nonce signer_id | Step 01 | ✅ |
| F10: SignerRevoked 이벤트 | Step 02 | ✅ |
| F11: metadata.signerId | Step 02 (broker), 03 (daemon) | ✅ |
| F12: ControlPayload.signerId | Step 03 | ✅ |
| F13: signer_list command | Step 03 | ✅ |
| F14: listSigners daemon | Step 03 | ✅ |
| F15: SignedApprovalBuilder | Step 04 | ✅ |
| F16: PairingService payload | Step 04 | ✅ |
| F17: SettingsScreen protocol | Step 04 | ✅ |
| F18: AppProviders targetSignerId | Step 04 | ✅ |
| F19: device_revoke 유지 | Final Gate | ✅ |
| N1: guarded-wdk tsc | Step 02 | ✅ |
| N2: daemon tsc | Step 03 | ✅ |
| N3: app tsc | Step 04 | ✅ |
| N4: guarded-wdk test | Step 02 | ✅ |
| N5: daemon test | Step 03 | ✅ |
| N6: PairingService.test.js | Step 04 | ✅ |
| N7: index.ts export | Step 01 | ✅ |
| D1: Commit 3+4 동일 PR | Final Gate | ✅ |
| E1: device_revoke → revokeSigner | Step 02 | ✅ |
| E2: SignerRevokedError throw | Step 02 | ✅ |
| E3: nonce 복합 키 | Step 02 | ✅ |
| E4: PairingService getDeviceId 유지 | Step 04 | ✅ |
| E5: IdentityKeyManager 변경 없음 | Final Gate | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| Layer-by-Layer Bottom-Up 4 커밋 | Step 01→02→03→04 순서 | ✅ |
| 기존 store 데이터 reset 허용 | Step 01 (새 스키마) | ✅ |
| device_revoke 문자열 유지 | Final Gate (F19) | ✅ |
| metadata.deviceId → signerId | Step 02, 03 | ✅ |
| PairingService 내부 유지 | Step 04 | ✅ |
| Commit 3+4 동일 release | Final Gate (D1) | ✅ |

## 최종 게이트 (Step 04 완료 후 일괄 검증)

아래는 cross-ticket 항목으로, 개별 티켓이 아닌 전체 완료 후 검증합니다.

| DoD 항목 | 검증 방법 |
|----------|----------|
| F19: device_revoke 유지 | `grep -r "signer_revoke" packages/*/src/ packages/*/tests/` → 0 + canonical 파일에서 `device_revoke` 유지 확인 |
| D1: Commit 3+4 동일 PR | PR commit list에 Step 03, 04 커밋 모두 포함 확인 |
| E5: IdentityKeyManager 변경 없음 | `grep -c "getDeviceId\|deviceId" packages/app/src/core/identity/IdentityKeyManager.ts` = 3 |
| guarded-wdk tsc + test | `npx tsc --noEmit -p packages/guarded-wdk/tsconfig.json && cd packages/guarded-wdk && npm test` |
| daemon tsc + test | `npx tsc --noEmit -p packages/daemon/tsconfig.json && cd packages/daemon && npx jest control-handler.test` (tool-surface.test.ts의 기존 rootDir 실패는 scope 외) |
| app tsc | `npx tsc --noEmit -p packages/app/tsconfig.json` |

## Step 상세
- [Step 01: guarded-wdk types + API + store](step-01-guarded-wdk-types-api.md)
- [Step 02: guarded-wdk broker + tests](step-02-guarded-wdk-broker-tests.md)
- [Step 03: daemon + tests](step-03-daemon.md)
- [Step 04: app shared contract + protocol](step-04-app.md)
