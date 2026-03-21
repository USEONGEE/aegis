# Step 01: @wdk-app/protocol 패키지 생성

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

- `packages/protocol/` 디렉토리 생성
- `package.json` 작성 (`"name": "@wdk-app/protocol"`, `"type": "module"`)
- `tsconfig.json` 작성
- `src/control.ts`: ControlMessage union, SignedApprovalFields, PolicyApprovalPayload, DeviceRevokePayload, PairingConfirmPayload, CancelQueuedPayload, CancelActivePayload, ControlResult, ControlEvent union (MessageQueuedEvent, MessageStartedEvent, CronSessionCreatedEvent, EventStreamEvent)
- `src/chat.ts`: RelayChatInput, ChatEvent union (ChatTypingEvent, ChatStreamEvent, ChatDoneEvent, ChatErrorEvent, ChatCancelledEvent)
- `src/relay.ts`: RelayEnvelope, RelayChannel
- `src/index.ts`: re-export all
- 루트 `package.json`의 `workspaces`에 `packages/protocol` 추가

## 2. 완료 조건
- [ ] `packages/protocol/package.json`에 `"name": "@wdk-app/protocol"` 존재 (F1)
- [ ] `packages/protocol/src/control.ts`에 `export type ControlMessage` 정의 존재 (F2)
- [ ] `packages/protocol/src/control.ts`에 `export type ControlEvent` 정의 존재 (F3)
- [ ] `packages/protocol/src/control.ts`에 `export interface SignedApprovalFields` 정의 존재 (F4)
- [ ] `packages/protocol/src/chat.ts`에 `export interface RelayChatInput` 정의 존재 (F5)
- [ ] `packages/protocol/src/chat.ts`에 `export type ChatEvent` 정의 존재 (F6)
- [ ] `packages/protocol/src/control.ts`에 `cancel_queued` variant 존재 (F11)
- [ ] `packages/protocol/src/control.ts`에 `cancel_active` variant 존재 (F12)
- [ ] `packages/protocol/src/control.ts`에 `MessageStartedEvent` 존재 (F13)
- [ ] `packages/protocol/src/control.ts`에 `MessageQueuedEvent` 존재 (F13b)
- [ ] `packages/protocol/src/control.ts`에 `CronSessionCreatedEvent` 존재 (F13c)
- [ ] `packages/protocol/src/control.ts`에 `EventStreamEvent` 존재 (F13d)
- [ ] `packages/protocol/src/relay.ts`에 `export interface RelayEnvelope` 존재 (F13e)
- [ ] `packages/protocol/src/relay.ts`에 `RelayChannel` 존재 (F13f)
- [ ] `npx tsc -p packages/protocol/tsconfig.json --noEmit` exit 0 (N2)
- [ ] 루트 `package.json`의 `workspaces`에 `packages/protocol` 포함

## 3. 롤백 방법
- 롤백 절차: `rm -rf packages/protocol` + 루트 `package.json`에서 workspace 항목 제거
- 영향 범위: 신규 패키지만 삭제. 기존 코드 변경 없음.

---

## Scope

### 신규 생성 파일
```
packages/protocol/
├── package.json           # 신규 - @wdk-app/protocol 패키지 설정
├── tsconfig.json          # 신규 - TS 컴파일 설정
└── src/
    ├── index.ts           # 신규 - re-export
    ├── control.ts         # 신규 - ControlMessage, ControlEvent, SignedApprovalFields 등
    ├── chat.ts            # 신규 - RelayChatInput, ChatEvent 등
    └── relay.ts           # 신규 - RelayEnvelope, RelayChannel
```

### 수정 대상 파일
```
package.json               # 수정 - workspaces에 packages/protocol 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| packages/protocol | 신규 생성 | 공유 wire 타입 패키지 |
| 루트 package.json | 직접 수정 | workspace 목록에 추가 |

### Side Effect 위험
- `npm install` 재실행 필요 (workspace 추가)

### 참고할 기존 패턴
- `packages/canonical/package.json`: 기존 순수 TS 유틸 패키지 구조 참고
- `packages/daemon/src/control-handler.ts`: 현재 타입 정의 원본 (이동 대상)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| packages/protocol/src/control.ts | ControlMessage, ControlEvent, SignedApprovalFields 정의 | ✅ OK |
| packages/protocol/src/chat.ts | RelayChatInput, ChatEvent 정의 | ✅ OK |
| packages/protocol/src/relay.ts | RelayEnvelope, RelayChannel 정의 | ✅ OK |
| 루트 package.json | workspace 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ControlMessage union (cancel_queued, cancel_active 포함) | ✅ control.ts | OK |
| ControlEvent union (MessageStartedEvent 포함) | ✅ control.ts | OK |
| RelayChatInput | ✅ chat.ts | OK |
| RelayEnvelope, RelayChannel | ✅ relay.ts | OK |
| 루트 workspace 등록 | ✅ package.json | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 02: daemon import 변경](step-02-daemon-import.md)
