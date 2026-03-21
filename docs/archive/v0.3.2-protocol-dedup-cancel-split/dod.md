# DoD (Definition of Done) - v0.3.2

## 기능 완료 조건

### 작업 A: @wdk-app/protocol 패키지

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `packages/protocol/` 디렉토리 존재, `@wdk-app/protocol` 패키지 설정 완료 | `cat packages/protocol/package.json \| rg '@wdk-app/protocol'` 1건 |
| F2 | `ControlMessage` union이 protocol 패키지에 정의됨 | `rg 'export type ControlMessage' packages/protocol/src/control.ts` 1건 |
| F3 | `ControlEvent` union이 protocol 패키지에 정의됨 | `rg 'export type ControlEvent' packages/protocol/src/control.ts` 1건 |
| F4 | `SignedApprovalFields`가 protocol 패키지에 정의됨 | `rg 'export interface SignedApprovalFields' packages/protocol/src/control.ts` 1건 |
| F5 | `RelayChatInput`이 protocol 패키지에 정의됨 | `rg 'export interface RelayChatInput' packages/protocol/src/chat.ts` 1건 |
| F6 | `ChatEvent` union이 protocol 패키지에 정의됨 | `rg 'export type ChatEvent' packages/protocol/src/chat.ts` 1건 |
| F7 | daemon의 control-handler.ts가 `@wdk-app/protocol`에서 import | `rg "from '@wdk-app/protocol'" packages/daemon/src/control-handler.ts` 1건 |
| F8 | daemon의 chat-handler.ts에서 `ChatMessage` 이름이 `RelayChatInput`으로 변경 | `rg 'RelayChatInput' packages/daemon/src/chat-handler.ts` 1건 |
| F9 | daemon의 chat-handler.ts에서 기존 `ChatMessage` interface 정의 제거 | `rg 'export interface ChatMessage' packages/daemon/src/chat-handler.ts` 결과 0건 |
| F10 | app의 types.ts가 `@wdk-app/protocol`에서 SignedApprovalFields import (또는 protocol 타입 사용) | `rg "@wdk-app/protocol" packages/app/src/core/approval/types.ts` 1건 |
| F11 | `cancel_queued` variant가 ControlMessage에 존재 | `rg "cancel_queued" packages/protocol/src/control.ts` 1건 |
| F12 | `cancel_active` variant가 ControlMessage에 존재 | `rg "cancel_active" packages/protocol/src/control.ts` 1건 |
| F13 | `message_started` 이벤트가 ControlEvent에 존재 | `rg "MessageStartedEvent" packages/protocol/src/control.ts` 1건 |
| F13b | `MessageQueuedEvent`가 ControlEvent에 존재 | `rg "MessageQueuedEvent" packages/protocol/src/control.ts` 1건 |
| F13c | `CronSessionCreatedEvent`가 ControlEvent에 존재 | `rg "CronSessionCreatedEvent" packages/protocol/src/control.ts` 1건 |
| F13d | `EventStreamEvent`가 ControlEvent에 존재 | `rg "EventStreamEvent" packages/protocol/src/control.ts` 1건 |
| F13e | `RelayEnvelope`가 protocol relay.ts에 정의됨 | `rg "export interface RelayEnvelope" packages/protocol/src/relay.ts` 1건 |
| F13f | `RelayChannel`이 protocol relay.ts에 정의됨 | `rg "RelayChannel" packages/protocol/src/relay.ts` 1건 |

### 작업 B: Cancel 분리 + AbortSignal 전파

| # | 조건 | 검증 방법 |
|---|------|----------|
| F14 | 기존 `cancel_message` case가 daemon에서 제거됨 | `rg "case 'cancel_message'" packages/daemon/src/control-handler.ts` 결과 0건 |
| F15 | `cancel_queued` case가 daemon control-handler에 존재 | `rg "case 'cancel_queued'" packages/daemon/src/control-handler.ts` 1건 |
| F16 | `cancel_active` case가 daemon control-handler에 존재 | `rg "case 'cancel_active'" packages/daemon/src/control-handler.ts` 1건 |
| F17a | `SessionMessageQueue`에 `cancelQueued()` 메서드 존재 | `rg 'cancelQueued' packages/daemon/src/message-queue.ts` 1건 이상 |
| F17b | `SessionMessageQueue`에 `cancelActive()` 메서드 존재 | `rg 'cancelActive' packages/daemon/src/message-queue.ts` 1건 이상 |
| F18 | 기존 `cancel()` 메서드가 제거됨 | `rg '  cancel ' packages/daemon/src/message-queue.ts` 결과 0건 |
| F19 | `OpenClawClient.chat()`에 `signal` 파라미터 지원 | `rg 'signal.*AbortSignal' packages/daemon/src/openclaw-client.ts` 1건 이상 |
| F20 | `OpenClawClient.chatStream()`에 `signal` 파라미터 지원 | `rg 'signal.*AbortSignal' packages/daemon/src/openclaw-client.ts` 2건 이상 (chat + chatStream) |
| F21 | `processChat()`이 signal을 openclawClient.chat/chatStream에 전달 | `rg '{ signal }' packages/daemon/src/tool-call-loop.ts` 2건 이상 (chat + chatStream 호출 시) |
| F22 | daemon이 큐에서 메시지 꺼낼 때 `message_started` 이벤트 전송 | `rg 'message_started' packages/daemon/src/index.ts` 1건 |
| F23 | app useChatStore에 messageState ('queued'/'active') 상태 존재 | `rg 'messageState' packages/app/src/stores/useChatStore.ts` 1건 이상 |
| F24 | app ChatDetailScreen에서 `message_started` 핸들러 존재 | `rg 'message_started' packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` 1건 |
| F25 | app ChatDetailScreen에서 messageState 기반으로 cancel_queued/cancel_active 분기 | `rg -A3 'messageState' packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` 에서 cancel_queued와 cancel_active가 조건 분기로 존재 |
| F26 | app RootNavigator에서 `cron_session_created`를 ControlEvent/CronSessionCreatedEvent 타입으로 해석 | `rg 'ControlEvent' packages/app/src/app/RootNavigator.tsx` 1건 이상 또는 `rg 'CronSessionCreatedEvent' packages/app/src/app/RootNavigator.tsx` 1건 이상 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | daemon tsc 에러 미증가 | `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 \| grep 'error TS' \| wc -l` 결과 ≤ 4 |
| N2 | protocol 패키지 tsc 통과 | `npx tsc -p packages/protocol/tsconfig.json --noEmit` exit 0 |
| N3 | daemon control-handler 테스트 통과 | `npx jest --config packages/daemon/jest.config.js --testPathPattern control-handler` 통과 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | cancel_active 시 OpenClaw HTTP 요청이 진행중 | AbortSignal이 SDK에 전달됨 | F19, F20, F21 검증으로 signal 전파 경로 확인 |
| E2 | cancel_queued로 이미 처리 시작된 메시지를 취소 시도 | { ok: false, reason: 'not_found' } 반환 (큐에 없으므로) | control-handler 테스트에서 검증 |
| E3 | cancel_active로 큐 대기 중인 메시지를 취소 시도 | { ok: false, reason: 'not_found' } 반환 (처리 중이 아니므로) | control-handler 테스트에서 검증 |

## 커버리지 매핑

### PRD 목표 → DoD

| PRD 목표 | DoD 항목 |
|----------|---------|
| @wdk-app/protocol 패키지 생성 | F1~F6, F13b~F13f |
| daemon/app import 변경 | F7~F10 |
| ChatMessage 네이밍 정리 | F8, F9 |
| cancel 분리 (cancel_queued/cancel_active) | F11~F18, F23~F25 |
| AbortSignal 전파 | F19~F21 |
| message_started 이벤트 | F13, F22, F24 |

### 설계 결정 → DoD

| 설계 결정 | DoD 항목 |
|----------|---------|
| A1: 별도 protocol 패키지 | F1 |
| ControlMessage + ControlEvent 양방향 | F2, F3 |
| C1: cancel 2개로 분리 | F14~F18 |
| D1: signal SDK 전파 | F19~F21 |
| message_started 이벤트 | F22 |
