# 작업 티켓 - v0.3.4

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Protocol + Daemon pairing + chat-handler | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | Daemon 잔여 dead code + incidental | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | App pairing 코드 제거 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
01 → 03 (protocol 변경 후 app 정리)
```

Step 01이 protocol+daemon core를 한번에 변경하여 cross-package 정합성 유지.
Step 02, 03은 01 이후 병렬 가능하나 순차 실행 권장.

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| Pairing 코드 3개 패키지 전면 제거 | Step 01, 03 | ✅ |
| Daemon 원칙 위반/dead code 정리 | Step 01, 02 | ✅ |
| 설계 원칙(No Fallback, No Optional) 복원 | Step 01 (queueManager required, else 삭제) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F4: PairingSession/pairing_confirm/index.ts | Step 01 | ✅ |
| F5~F6: queueManager required, else 분기 | Step 01 | ✅ |
| F7~F10: ToolResult, listPending, getQueue, JSDoc | Step 02 | ✅ |
| F11~F13: Protocol PairingConfirmPayload | Step 01 | ✅ |
| F14~F16: App PairingService, SettingsScreen | Step 03 | ✅ |
| N1: daemon tsc | Step 01, 02 | ✅ |
| N2: protocol tsc | Step 01 | ✅ |
| N3: daemon jest | Step 01, 02 | ✅ |
| N4: CI 체크 | Step 03 (최종) | ✅ |
| N5: app tsc | Step 03 | ✅ |
| E1: pairing_confirm → default case | Step 01 | ✅ |
| E2: control-handler 테스트 | Step 01 | ✅ |
| E3: message-queue 테스트 | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| Protocol pairing variant 제거 | Step 01 | ✅ |
| Daemon pairing + chat-handler 정리 | Step 01 | ✅ |
| Daemon misc dead code | Step 02 | ✅ |
| App PairingService + UI 삭제 | Step 03 | ✅ |
| 주석 정리 | Step 03 | ✅ |

## Step 상세
- [Step 01: Protocol + Daemon pairing + chat-handler](step-01-protocol-daemon-pairing.md)
- [Step 02: Daemon 잔여 dead code + incidental](step-02-daemon-misc-cleanup.md)
- [Step 03: App pairing 코드 제거](step-03-app-pairing-removal.md)
