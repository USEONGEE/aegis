# Step 44: app - Settings 탭

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 34 (IdentityKeyManager), Step 35 (E2E Pairing), Step 36 (RelayClient), Step 37 (SignedApprovalBuilder)

---

## 1. 구현 내용 (design.md + PRD 기반)

Settings 탭 — pairing 관리, 디바이스 목록/revoke, 알림 설정, relay 연결 상태.

- `src/domains/settings/screens/SettingsScreen.tsx`: Settings 탭 메인 화면

**Pairing Management (show paired devices)**:
- 현재 pairing 상태 표시 (paired / not paired)
- "Start Pairing" 버튼 → PairingService 플로우 시작
  - QR 코드 표시 (daemon이 스캔)
  - SAS 확인 화면 (6자리 숫자 + Confirm/Cancel)
  - pairing 완료 → "Paired with [daemon name]" 표시
- "Unpair" 버튼 → pairing 해제

**Device Revoke 버튼**:
- paired 디바이스 목록 표시 (daemon에서 devices 정보 수신)
- 각 디바이스: deviceId, type (daemon/app), paired_at, last_seen_at
- "Revoke" 버튼 → SignedApprovalBuilder.forDeviceRevoke() → SignedApproval 생성 → RelayClient.sendControl() 전송
- revoke 완료 시 리스트에서 "Revoked" 표시 또는 제거

**SignedApproval 생성 (device_revoke)**:
```typescript
SignedApprovalBuilder
  .forDeviceRevoke({ targetHash: SHA256(deviceId), chain: '', requestId })
  .withIdentity(identityKeyManager)
  .withDeviceId(myDeviceId)
  .withExpiry(60)
  .withNonce(nextNonce)
  .build()
```

**Notification Settings**:
- 푸시 알림 on/off 토글
- Expo push token 등록/해제
- 알림 유형별 설정 (tx approval, policy request, execution result 등)

**Relay Connection Status**:
- 현재 Relay WebSocket 연결 상태 표시 (connected / disconnected / reconnecting)
- 마지막 연결 시간
- Relay 서버 URL 표시

**기타**:
- identity key 상태 표시 (public key 축약 + 복사)
- "Delete Identity Key" 위험 액션 (확인 다이얼로그 + IdentityKeyManager.delete())

## 2. 완료 조건
- [ ] `src/domains/settings/screens/SettingsScreen.tsx` 구현 (placeholder 대체)
- [ ] Pairing Management 섹션
  - [ ] 현재 pairing 상태 표시 (paired/not paired)
  - [ ] "Start Pairing" 버튼 → PairingService.generateQRPayload() → QR 코드 렌더
  - [ ] SAS 확인 화면: 6자리 숫자 표시 + "Confirm" / "Cancel" 버튼
  - [ ] pairing 완료 시 상태 업데이트
  - [ ] "Unpair" 버튼 → pairing 해제
- [ ] Device List + Revoke 섹션
  - [ ] 디바이스 목록 표시 (deviceId, type, paired_at)
  - [ ] "Revoke" 버튼 → SignedApprovalBuilder.forDeviceRevoke() → RelayClient.sendControl()
  - [ ] revoke 후 리스트 갱신
- [ ] Notification Settings 섹션
  - [ ] 푸시 알림 토글 (Expo Notifications 권한 요청)
  - [ ] push token 등록 → Relay에 전달 (updateDevicePushToken)
- [ ] Relay Connection Status 섹션
  - [ ] WebSocket 연결 상태 표시 (connected/disconnected/reconnecting)
  - [ ] 마지막 연결 시간 + Relay URL
- [ ] identity key 상태 표시 (public key 축약 + 복사)
- [ ] "Delete Identity Key" 위험 액션 (확인 다이얼로그 + IdentityKeyManager.delete())

## 3. 롤백 방법
- `src/domains/settings/screens/SettingsScreen.tsx`를 placeholder로 복원

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/settings/screens/SettingsScreen.tsx  # placeholder → 실제 구현
```

### 신규 생성 파일
```
없음 (기존 core 모듈 활용: IdentityKeyManager, PairingService, RelayClient, SignedApprovalBuilder)
```

### Side Effect 위험
- SettingsScreen.tsx 수정 — placeholder 대체
- IdentityKeyManager (Step 34), PairingService (Step 35), RelayClient (Step 36), SignedApprovalBuilder (Step 37) 의존
- Expo Notifications 권한 요청 (런타임)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| SettingsScreen.tsx | Settings 탭 4개 섹션 (PRD Layer 5 Settings 탭) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Pairing management (QR + SAS) | ✅ SettingsScreen.tsx + PairingService | OK |
| Device list + revoke (SignedApproval) | ✅ SettingsScreen.tsx + SignedApprovalBuilder | OK |
| Notification settings | ✅ SettingsScreen.tsx + Expo Notifications | OK |
| Relay connection status | ✅ SettingsScreen.tsx + RelayClient | OK |
| Identity key 표시/삭제 | ✅ SettingsScreen.tsx + IdentityKeyManager | OK |

### 검증 통과: ✅

---

→ relay + app 전체 완료. 다음 phase: E2E 통합 테스트.
