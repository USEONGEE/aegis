# 티켓 현황 - v0.4.2

## 전체 진행 상황

| Step | 설명 | 난이도 | 상태 | 선행 |
|------|------|--------|------|------|
| 01 | [WDK 이벤트 타입 시스템](step-01-event-types.md) | 🟡 보통 | ⏳ 대기 | 없음 |
| 02 | [Dual Emitter 수정](step-02-dual-emitter-fix.md) | 🟠 중간 | ⏳ 대기 | 01 |
| 03 | [원자적 Emit + ApprovalFailed](step-03-atomic-emit.md) | 🔴 어려움 | ⏳ 대기 | 02 |
| 04 | [Broker에 후처리 내재화](step-04-broker-internalize.md) | 🔴 어려움 | ⏳ 대기 | 03 |
| 05 | [Control-Handler 단순화](step-05-control-handler-simplify.md) | 🟠 중간 | ⏳ 대기 | 04 |
| 06 | [Protocol + RELAY_EVENTS 업데이트](step-06-protocol-relay-events.md) | 🟡 보통 | ⏳ 대기 | 05 |
| 07 | [테스트 + 검증](step-07-tests-verify.md) | 🟠 중간 | ⏳ 대기 | 06 |

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 티켓 |
|---------|------|
| 1. ControlResult 앱 전송 제거 (승인 6종) | Step 05 (handler null 반환) + Step 06 (index.ts forward skip) |
| 2. ApprovalFailed 이벤트 추가 | Step 01 (타입) + Step 03 (emit 구현) + Step 06 (RELAY_EVENTS) |
| 3. WDK 이벤트 타입 규격화 (14종) | Step 01 (타입 정의) + Step 06 (EventStreamEvent 반영) |
| 4. daemon store 직접 접근 제거 | Step 04 (broker 내재화) + Step 05 (handler 단순화) |
| 5. 이벤트 발행 원자적 | Step 03 (원자적 emit 구현) |
| 6. 단일 경로 + 대칭적 | Step 02 (dual emitter 수정) + Step 05 (ControlResult 제거) + Step 06 (eventName 제거) |

### DoD → 티켓

| DoD | 티켓 |
|-----|------|
| F1. Dual Emitter 수정 | Step 02 |
| F2. 이벤트 타입 규격화 | Step 01 |
| F3. 이벤트 발행 원자성 | Step 03 |
| F4. ApprovalFailed 추가 | Step 01 + 03 + 06 |
| F5. store 직접 접근 제거 | Step 04 + 05 |
| F6. ControlResult forward 제거 | Step 05 + 06 |
| F7. EventStreamEvent 정리 | Step 06 |
| F8. ApprovalSubmitContext | Step 04 (guarded-wdk에 타입 정의 + 적용) |
| NF1. 타입 안전 | Step 01~06 (각 tsc 확인) + 07 (CI) |
| NF2. 테스트 | Step 07 |
| NF3. 의존 방향 | Step 01 (protocol 소유) + 07 (CI 체크) |
| NF4. 후속 의존 작업 | Step 07 (PROGRESS.md에 기록) |
| E1. 빈 trustedApprovers | Step 02 |
| E2. Mock WDK 이벤트 | Step 02 |
| E3. verifyApproval 실패 | Step 03 + 07 |
| E4. appendHistory 실패 | Step 03 + 07 |
| E5. Listener 예외 | Step 03 + 07 |

### 설계 결정 → 티켓

| 설계 결정 | 티켓 |
|-----------|------|
| TD: Emitter 소유자 = factory | Step 02 |
| TD: Event 타입 위치 = protocol | Step 01 |
| TD: ApprovalFailed 범위 = submitApproval 전체 | Step 03 |
| TD: 이벤트 발행 = best-effort emit | Step 03 |
| TD: savePolicy 전달 = ApprovalSubmitContext DU | Step 04 (guarded-wdk에 정의 + 적용) |
| TD: setTrustedApprovers = broker 내부 | Step 04 |
| TD: ControlResult forward = 승인 null, cancel 유지 | Step 05 |
| TD: RELAY_EVENTS += ApprovalFailed | Step 06 |
| TD: eventName 제거 | Step 06 |
| TD: Mock WDK = 실제 emitter | Step 02 |

### 커버리지 확인
- PRD 목표 6/6 커버 ✅
- DoD F1~F8 + NF1~NF4 + E1~E5 전체 커버 ✅
- 설계 결정 10/10 커버 ✅

## 파일 영향 범위 요약

| 파일 | Step | 변경 유형 |
|------|------|----------|
| `protocol/src/events.ts` | 01 | 신규 |
| `protocol/src/index.ts` | 01 | 수정 (export 추가) |
| `protocol/src/control.ts` | 06 | 수정 (EventStreamEvent) |
| `guarded-wdk/src/signed-approval-broker.ts` | 03, 04 | 수정 (핵심 변경) |
| `daemon/src/wdk-host.ts` | 02 | 수정 (emitter/broker 제거) |
| `daemon/src/control-handler.ts` | 05 | 수정 (store 접근 제거) |
| `daemon/src/index.ts` | 05, 06 | 수정 (forward skip + RELAY_EVENTS) |
| `guarded-wdk/tests/approval-broker.test.ts` | 07 | 수정 |
| `daemon/tests/control-handler.test.ts` | 07 | 수정 |
| `daemon/tests/event-stream-wire.test.ts` | 07 | 신규 |
