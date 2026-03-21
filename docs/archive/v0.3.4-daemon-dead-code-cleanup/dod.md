# DoD (Definition of Done) - v0.3.4

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `PairingSession` 인터페이스가 daemon에서 제거됨 | `grep -r "PairingSession" packages/daemon/src/` → 결과 없음 |
| F2 | `pairing_confirm` case 블록이 `handleControlMessage`에서 제거됨 | `grep "pairing_confirm" packages/daemon/src/control-handler.ts` → 결과 없음 |
| F3 | `handleControlMessage` 시그니처에서 `pairingSession` 파라미터 제거됨 | `grep "pairingSession" packages/daemon/src/control-handler.ts` → 결과 없음 |
| F4 | `index.ts`에서 PairingSession import, pairingSession 변수, 호출 인자 모두 제거됨 | `grep -E "pairingSession\|PairingSession" packages/daemon/src/index.ts` → 결과 없음 |
| F5 | `handleChatMessage`의 `queueManager` 파라미터가 required로 변경됨 | `grep "queueManager?" packages/daemon/src/chat-handler.ts` → 결과 없음 |
| F6 | `handleChatMessage`의 else 분기가 제거됨 | `grep -c "_processChatDirect" packages/daemon/src/chat-handler.ts` → 1 (export 선언만) |
| F7 | `ToolResult` deprecated alias가 제거됨 | `grep "^export type ToolResult" packages/daemon/src/tool-surface.ts` → 결과 없음 |
| F8 | `listPending()` + `PendingMessageRequest`가 제거됨 | `grep -E "listPending\|PendingMessageRequest" packages/daemon/src/message-queue.ts` → 결과 없음 |
| F9 | `getQueue()` 메서드가 private으로 변경됨 | `grep "^\s*private getQueue\s*(" packages/daemon/src/message-queue.ts` → 1건 매치 |
| F10 | 중복 JSDoc이 제거됨 | `sed -n '/^  onMessage .*(handler/,/^  send (type/p' packages/daemon/src/relay-client.ts \| grep -c '/\*\*'` → 1 |
| F11 | protocol `PairingConfirmPayload` 제거됨 | `grep "PairingConfirmPayload" packages/protocol/src/control.ts` → 결과 없음 |
| F12 | protocol `ControlMessage`에서 `pairing_confirm` variant 제거됨 | `grep "pairing_confirm" packages/protocol/src/control.ts` → 결과 없음 |
| F13 | protocol barrel export 정리됨 | `grep "PairingConfirmPayload" packages/protocol/src/index.ts` → 결과 없음 |
| F14 | App `PairingService.ts` 파일 삭제됨 | `test ! -f packages/app/src/core/crypto/PairingService.ts` |
| F15 | App `PairingService.test.js` 파일 삭제됨 | `test ! -f packages/app/tests/PairingService.test.js` |
| F16 | SettingsScreen에서 pairing UI + 관련 import/state/handler 제거됨 | `grep -E "PairingService\|pairingSAS\|pairingConfirm\|handleStartPairing\|PairingQRPayload" packages/app/src/domains/settings/screens/SettingsScreen.tsx` → 결과 없음 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | daemon 패키지 TypeScript 컴파일 에러 0 | `cd packages/daemon && npx tsc --noEmit` |
| N2 | protocol 패키지 TypeScript 컴파일 에러 0 | `cd packages/protocol && npx tsc --noEmit` |
| N3 | daemon 테스트 통과 | `cd packages/daemon && npx jest` |
| N4 | CI 체크 통과 | `npx tsx scripts/check/index.ts` |
| N5 | app 패키지 TypeScript 컴파일 에러 0 | `cd packages/app && npx tsc --noEmit` |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | App이 `pairing_confirm` 메시지를 daemon에 전송 (stale code path) | daemon의 `default` case가 `Unknown control type` 에러 반환 | `grep -A5 "default:" packages/daemon/src/control-handler.ts` → `Unknown control type` 문자열 확인 |
| E2 | pairing_confirm 테스트 제거 후 나머지 control-handler 테스트 통과 | 다른 case 테스트 영향 없음 | `cd packages/daemon && npx jest -- control-handler` |
| E3 | listPending 테스트 제거 후 나머지 message-queue 테스트 통과 | 다른 메서드 테스트 영향 없음 | `cd packages/daemon && npx jest -- message-queue` |
