# Step 02: daemon import + cancel 분리 + message_started

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (protocol 패키지 존재)

---

## 1. 구현 내용 (design.md 기반)

- `packages/daemon/src/control-handler.ts`:
  - `SignedApprovalFields`, `PolicyApprovalPayload`, `DeviceRevokePayload`, `PairingConfirmPayload`, `ControlMessage`, `ControlResult` 타입 정의 제거
  - `@wdk-app/protocol`에서 import로 대체
  - `CancelMessagePayload` 제거 → `CancelQueuedPayload`, `CancelActivePayload`로 대체 (protocol에서 import)
  - `cancel_message` case → `cancel_queued` + `cancel_active` 2개 case로 분리 (Step 03의 cancel 분리도 이 Step에서 함께 수행 — protocol 타입과 handler를 동시에 변경해야 tsc 통과)
- `packages/daemon/src/message-queue.ts`:
  - `cancel()` → `cancelQueued()` + `cancelActive()` 분리
- `packages/daemon/src/index.ts`:
  - 큐에서 메시지 꺼낼 때 `message_started` control 이벤트 전송
- `packages/daemon/src/chat-handler.ts`:
  - `ChatMessage` interface 정의 제거
  - `@wdk-app/protocol`의 `RelayChatInput`으로 import 변경
  - 함수 시그니처의 `msg: ChatMessage` → `msg: RelayChatInput`
- `packages/daemon/src/index.ts`:
  - `ControlMessage` import 경로를 `./control-handler.js` → `@wdk-app/protocol`로 변경
- `packages/daemon/package.json`:
  - `@wdk-app/protocol` 의존성 추가 (`"workspace:*"`)

## 2. 완료 조건
- [ ] `packages/daemon/src/control-handler.ts`에서 `from '@wdk-app/protocol'` import 존재 (F7)
- [ ] `packages/daemon/src/chat-handler.ts`에서 `RelayChatInput` 사용 (F8)
- [ ] `packages/daemon/src/chat-handler.ts`에서 `export interface ChatMessage` 정의 0건 (F9)
- [ ] `packages/daemon/src/control-handler.ts`에서 `export interface SignedApprovalFields` 정의 0건 (protocol로 이동됨)
- [ ] `packages/daemon/src/control-handler.ts`에서 `export type ControlMessage` 정의 0건 (protocol로 이동됨)
- [ ] `packages/daemon/src/index.ts`에서 `ControlMessage`를 `@wdk-app/protocol`에서 import
- [ ] `packages/daemon/src/control-handler.ts`에서 `case 'cancel_message'` 0건 (F14)
- [ ] `packages/daemon/src/control-handler.ts`에서 `case 'cancel_queued'` 존재 (F15)
- [ ] `packages/daemon/src/control-handler.ts`에서 `case 'cancel_active'` 존재 (F16)
- [ ] `packages/daemon/src/message-queue.ts`에서 `cancelQueued` 존재 (F17a)
- [ ] `packages/daemon/src/message-queue.ts`에서 `cancelActive` 존재 (F17b)
- [ ] `packages/daemon/src/message-queue.ts`에서 기존 `  cancel (` 패턴 0건 (F18)
- [ ] `packages/daemon/src/index.ts`에서 `message_started` 이벤트 전송 존재 (F22)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 | grep 'error TS' | wc -l` 결과 <= 4 (N1)

## 3. 롤백 방법
- 롤백 절차: git에서 수정된 daemon 파일 복원 (`git checkout -- packages/daemon/`)
- 영향 범위: daemon 패키지 내부 import 경로만 변경. 런타임 동작 변경 없음.

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/
│   ├── control-handler.ts  # 수정 - 타입 정의 제거, @wdk-app/protocol에서 import
│   ├── chat-handler.ts     # 수정 - ChatMessage → RelayChatInput import 변경
│   ├── message-queue.ts    # 수정 - cancel() → cancelQueued() + cancelActive() 분리
│   └── index.ts            # 수정 - ControlMessage import 경로 변경 + message_started 이벤트
└── package.json            # 수정 - @wdk-app/protocol 의존성 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| control-handler.ts | 직접 수정 | 타입 정의 제거 + import 변경 |
| chat-handler.ts | 직접 수정 | ChatMessage → RelayChatInput |
| index.ts | 직접 수정 | import 경로 변경 |
| tool-call-loop.ts | 간접 영향 | `ChatMessage`를 openclaw-client.ts에서 import (openclaw 내부 ChatMessage는 별개 — OpenClaw SDK용이므로 이 Step에서 변경 불요) |
| control-handler.test.ts | 간접 영향 | 테스트에서 `SignedApprovalFields` import 경로가 변경됨 → Step 06에서 처리 |

### Side Effect 위험
- `control-handler.test.ts`의 import 경로가 깨질 수 있음 → Step 06에서 수정
- `PairingSession` 타입은 daemon 내부 전용이므로 protocol로 이동하지 않음 (control-handler.ts에 유지)

### 참고할 기존 패턴
- `packages/daemon/src/control-handler.ts:3`: 현재 `@wdk-app/guarded-wdk` import 패턴 참고

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| control-handler.ts | 타입 이동 + cancel 분리 | ✅ OK |
| chat-handler.ts | ChatMessage → RelayChatInput | ✅ OK |
| message-queue.ts | cancel() → cancelQueued() + cancelActive() | ✅ OK |
| index.ts | import 변경 + message_started 이벤트 | ✅ OK |
| daemon/package.json | @wdk-app/protocol 의존성 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| control-handler.ts 타입 이동 | ✅ | OK |
| control-handler.ts cancel 분리 (cancel_queued/cancel_active) | ✅ | OK |
| chat-handler.ts ChatMessage 제거 | ✅ | OK |
| message-queue.ts cancelQueued/cancelActive | ✅ | OK |
| index.ts import + message_started | ✅ | OK |
| daemon/package.json 의존성 | ✅ | OK |
| openclaw-client.ts의 ChatMessage | ❌ 변경 불요 | OK (daemon 내부 전용) |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 04: AbortSignal 전파](step-04-abort-signal.md)
