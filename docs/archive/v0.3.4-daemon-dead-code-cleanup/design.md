# 설계 - v0.3.4

## 변경 규모
**규모**: 일반 기능
**근거**: daemon + protocol + app 3개 패키지 수정, 내부 API 변경 (`handleControlMessage` 시그니처, `ControlMessage` union), UI 제거

---

## 문제 요약
daemon/protocol/app 3개 패키지에 걸쳐 pairing 관련 dead code와 daemon 내부 원칙 위반 코드가 존재한다. Pairing은 daemon이 session을 개시하지 못하므로 전체 경로가 dead.

> 상세: [README.md](README.md) 참조

## 접근법
**직접 삭제** — pairing 관련 코드를 3개 패키지에서 전면 제거하고, daemon 내부 dead code를 함께 정리한다.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 3개 패키지 전면 삭제 | 깔끔, dead UI 제거로 사용자 혼란 방지 | cross-package 변경이라 한 번에 해야 함 | ✅ |
| B: daemon/protocol만 정리, app 후속 | 범위 작음 | app에 stale dead UI 남음, 사용자 혼란 지속 | ❌ |

**선택 이유**: Pairing UI가 사용자에게 도달 가능하지만 항상 실패하는 dead path이므로, 사용자 경험을 위해 한번에 제거.

## 기술 결정

**Protocol:**
1. `PairingConfirmPayload` interface + `ControlMessage` union variant 제거
2. barrel export 정리

**Daemon:**
3. `PairingSession` interface + `pairing_confirm` case + 시그니처에서 `pairingSession` 파라미터 제거
4. `index.ts`: import/변수/호출 인자 제거
5. `handleChatMessage`: `queueManager` required 변경 + else 분기 삭제
6. `ToolResult` deprecated alias 제거
7. `listPending()` + `PendingMessageRequest` 삭제
8. `getQueue()` public → private
9. 중복 JSDoc 제거
10. pairing_confirm 테스트 3건 + listPending 테스트 삭제

**App:**
11. `PairingService.ts` 파일 삭제
12. `PairingService.test.js` 파일 삭제
13. `SettingsScreen.tsx`: pairing UI 섹션 + 관련 state/handler/import 제거
14. `E2ECrypto.ts`, `IdentityKeyManager.ts`, `RelayClient.ts`: pairing 관련 주석 정리

---

## 범위 / 비범위

**범위 (In Scope):**
- `packages/protocol/src/` — PairingConfirmPayload + variant + barrel
- `packages/daemon/src/` — pairing, chat-handler, misc dead code
- `packages/daemon/tests/` — pairing 테스트 + listPending 테스트
- `packages/app/src/core/crypto/PairingService.ts` — 파일 삭제
- `packages/app/src/domains/settings/screens/SettingsScreen.tsx` — pairing UI 제거
- `packages/app/tests/PairingService.test.js` — 파일 삭제
- pairing 관련 주석 정리 (E2ECrypto, IdentityKeyManager, RelayClient)

**비범위 (Out of Scope):**
- E2E 암호화 인프라 (setSessionKey, encrypt/decrypt)
- dead code CI 체크 추가

## API/인터페이스 계약

### handleControlMessage 시그니처 변경
**Before:** `..., pairingSession?: PairingSession | null, queueManager?: ...`
**After:** `..., queueManager?: ...` (pairingSession 파라미터 제거)

### ControlMessage union 변경
**Before:** 9 variants (tx_approval, policy_approval, policy_reject, device_revoke, wallet_create, wallet_delete, pairing_confirm, cancel_queued, cancel_active)
**After:** 8 variants (pairing_confirm 제거)

### handleChatMessage 시그니처 변경
**Before:** `queueManager?: MessageQueueManager | null`
**After:** `queueManager: MessageQueueManager`

## 테스트 전략

### 삭제 대상
- `packages/daemon/tests/control-handler.test.ts`: pairing_confirm 3건
- `packages/daemon/tests/message-queue.test.ts`: listPending 1건
- `packages/app/tests/PairingService.test.js`: 파일 삭제

### 검증 명령
```bash
cd packages/protocol && npx tsc --noEmit
cd packages/daemon && npx tsc --noEmit && npx jest
cd packages/app && npx tsc --noEmit
npx tsx scripts/check/index.ts
```

---

## 리스크/오픈 이슈
N/A: 순수 삭제 작업이며, 영향 범위가 명확하고 패키지별 타입체크/테스트로 검증 가능.
