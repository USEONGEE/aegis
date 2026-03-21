# Step 03: App pairing 코드 제거

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 (protocol pairing variant 제거 후)

---

## 1. 구현 내용
- `PairingService.ts` 파일 삭제 (`app/src/core/crypto/PairingService.ts`)
- `PairingService.test.js` 파일 삭제 (`app/tests/PairingService.test.js`)
- `SettingsScreen.tsx`에서 pairing UI 섹션 제거:
  - `PairingService` + `PairingQRPayload` import 제거
  - `pairingSAS`, `pairingConfirm` state 제거
  - `handleStartPairing` 함수 제거
  - Pairing UI 렌더링 섹션 제거 (SAS 확인 UI + "Scan Daemon QR Code" 버튼)
- pairing 관련 주석 정리:
  - `E2ECrypto.ts`: pairing 언급 주석 업데이트
  - `IdentityKeyManager.ts`: pairing 언급 주석 업데이트
  - `RelayClient.ts`: pairing 언급 주석 업데이트

## 2. 완료 조건
- [ ] `test ! -f packages/app/src/core/crypto/PairingService.ts` (F14)
- [ ] `test ! -f packages/app/tests/PairingService.test.js` (F15)
- [ ] `grep -E "PairingService|pairingSAS|pairingConfirm|handleStartPairing|PairingQRPayload" packages/app/src/domains/settings/screens/SettingsScreen.tsx` → 결과 없음 (F16)
- [ ] `grep -i "pairing" packages/app/src/core/crypto/E2ECrypto.ts` → 결과 없음 (주석 정리)
- [ ] `grep -i "pairing" packages/app/src/core/identity/IdentityKeyManager.ts` → 결과 없음 (주석 정리)
- [ ] `grep -i "pairing" packages/app/src/core/relay/RelayClient.ts` → 결과 없음 (주석 정리)
- [ ] `cd packages/app && npx tsc --noEmit` 통과 (N5)
- [ ] `npx tsx scripts/check/index.ts` 통과 (N4 — 최종 CI 체크)

## 3. 롤백 방법
- `git checkout -- packages/app/`

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/
│   ├── core/crypto/PairingService.ts       # 삭제
│   ├── core/crypto/E2ECrypto.ts            # 수정 - 주석 정리
│   ├── core/identity/IdentityKeyManager.ts # 수정 - 주석 정리
│   ├── core/relay/RelayClient.ts           # 수정 - 주석 정리
│   └── domains/settings/screens/SettingsScreen.tsx  # 수정 - pairing UI 제거
└── tests/
    └── PairingService.test.js              # 삭제
```

## FP/FN 검증
### 검증 통과: ✅
