# 작업 티켓 - v0.3.2

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | @wdk-app/protocol 패키지 생성 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | daemon import + cancel 분리 + message_started | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | ~~(Step 02에 병합)~~ | - | - | - | - | - | - |
| 04 | AbortSignal 전파 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | app import 변경 + cancel 분기 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | 테스트 업데이트 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 04
     02 → 05
     02 → 06
```

- Step 01 (protocol 패키지)은 모든 후속 Step의 기반
- Step 02 (daemon import + cancel 분리)는 Step 04, 05, 06의 선행 조건
- Step 04 (AbortSignal)는 Step 02 이후 독립 수행 가능
- Step 05 (app 변경)는 Step 02 이후 수행 가능
- Step 06 (테스트)는 Step 02 이후 수행 가능

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| @wdk-app/protocol 패키지 생성 | Step 01 | ✅ |
| daemon/app import 변경 | Step 02, 05 | ✅ |
| ChatMessage 네이밍 정리 (RelayChatInput) | Step 01 (정의), 02 (daemon 적용) | ✅ |
| cancel 분리 (cancel_queued / cancel_active) | Step 01 (타입), 02 (daemon), 05 (app) | ✅ |
| AbortSignal 전파 (OpenClaw SDK까지) | Step 04 | ✅ |
| message_started 이벤트 | Step 01 (타입), 02 (daemon 전송), 05 (app 수신) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F6: protocol 패키지 타입 | Step 01 | ✅ |
| F7~F9: daemon import 변경 | Step 02 | ✅ |
| F10: app types.ts import | Step 05 | ✅ |
| F11~F12: cancel variant 타입 | Step 01 | ✅ |
| F13, F13b~F13f: ControlEvent + relay 타입 | Step 01 | ✅ |
| F14~F18: cancel handler/queue 분리 | Step 02 | ✅ |
| F19~F21: AbortSignal 전파 | Step 04 | ✅ |
| F22: message_started 전송 | Step 02 | ✅ |
| F23~F26: app 소비 | Step 05 | ✅ |
| N1: daemon tsc | Step 02, 04, 06 | ✅ |
| N2: protocol tsc | Step 01 | ✅ |
| N3: control-handler 테스트 | Step 06 | ✅ |
| E1: cancel_active abort | Step 04 | ✅ |
| E2~E3: cancel 엣지케이스 | Step 06 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| A1: 별도 protocol 패키지 | Step 01 | ✅ |
| B2: protocol에 WireChat 타입 정의 | Step 01 | ✅ |
| C1: cancel 2개로 분리 | Step 01 (타입), 02 (daemon), 05 (app) | ✅ |
| D1: signal SDK 전파 | Step 04 | ✅ |
| message_started 이벤트 | Step 01 (타입), 02 (전송), 05 (수신) | ✅ |
| SessionMessageQueue 분리 | Step 02 | ✅ |
| OpenClawClient 시그니처 변경 | Step 04 | ✅ |

## Step 상세
- [Step 01: @wdk-app/protocol 패키지 생성](step-01-protocol-package.md)
- [Step 02: daemon import + cancel 분리 + message_started](step-02-daemon-import.md)
- [Step 03: (Step 02에 병합)](step-03-cancel-split.md)
- [Step 04: AbortSignal 전파](step-04-abort-signal.md)
- [Step 05: app import 변경 + cancel 분기](step-05-app-cancel.md)
- [Step 06: 테스트 업데이트](step-06-tests.md)
