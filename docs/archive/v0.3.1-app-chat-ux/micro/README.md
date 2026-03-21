# 작업 티켓 - v0.3.1

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Store 재구조화 + 영속화 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | 세션별 대화창 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | 수신 흐름 + Cron + 오프라인 복구 | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | Tool calls 실시간 표시 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04
```

- 01(Store)이 모든 후속의 기반
- 02(세션 UI)가 03의 ChatDetailScreen 전제
- 03(Daemon 이벤트)이 04의 relay 메시지 계약 전제

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. 대화 이력 영속성 | Step 01 | ✅ |
| 2. 멀티 세션 UI | Step 02 | ✅ |
| 3. 메시지 수신 흐름 완성 | Step 03 | ✅ |
| 4. Cron 메시지 전파 | Step 03 | ✅ |
| 5. Tool call 실시간 표시 | Step 04 | ✅ |
| 6. 오프라인 cron 응답 복구 | Step 01 (커서 영속화) + Step 03 (relay polling) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 Record 구조 | Step 01 | ✅ |
| F2 zustand persist | Step 01 | ✅ |
| F3 재시작 후 메시지 유지 | Step 01 | ✅ |
| F4 isLoading/isTyping 비영속 | Step 01 | ✅ |
| F5 currentSessionId 복원 | Step 01 + Step 02 | ✅ |
| F6 discriminated union | Step 01 | ✅ |
| F7 AsyncStorage 의존성 | Step 01 | ✅ |
| F8 Stack Navigator | Step 02 | ✅ |
| F9 새 대화 생성 | Step 02 | ✅ |
| F10 기존 세션 로드 | Step 02 | ✅ |
| F11 역순 정렬 | Step 02 | ✅ |
| F12 cron 라벨 | Step 02 | ✅ |
| F13 뒤로가기 affordance | Step 02 | ✅ |
| F14 native-stack 의존성 | Step 02 | ✅ |
| F15 queued "전송됨 ✓" | Step 03 | ✅ |
| F16 queuedMessageId 비영속 | Step 01 (정의) + Step 03 (활용) | ✅ |
| F17 cancelled 메시지 | Step 03 | ✅ |
| F18a~d 기존 동작 유지 | Step 02 (완료 조건에 회귀 항목 명시) | ✅ |
| F19 source 파라미터 | Step 03 | ✅ |
| F20 queue processor source 전달 | Step 03 | ✅ |
| F21 relay 메시지 source | Step 03 | ✅ |
| F22 cron typing 스킵 | Step 03 | ✅ |
| F23 세션 필터 완화 | Step 03 | ✅ |
| F24 addMessage 자동 upsert | Step 01 | ✅ |
| F25 onToolStart/onToolDone | Step 04 | ✅ |
| F26 tool 콜백 호출 | Step 04 | ✅ |
| F27 relay.send tool 이벤트 | Step 04 | ✅ |
| F28 tool_start UI | Step 04 | ✅ |
| F29 tool_done UI | Step 04 | ✅ |
| F30 streamCursors 영속화 | Step 01 | ✅ |
| F31 chatCursors authenticate | Step 03 | ✅ |
| F32 relay chatCursors polling | Step 03 | ✅ |
| F33 cron_session_created | Step 03 | ✅ |
| F34 오프라인 cron 복구 시나리오 | Step 01 + Step 03 | ✅ |
| N1 daemon 타입 정합성 | Step 03 + Step 04 (코드 검사) | ✅ |
| N2 app tsc | Step 01 + Step 02 + Step 03 + Step 04 (각 티켓에 tsc 완료 조건 명시) | ✅ |
| N3 createSession source 필수 | Step 01 | ✅ |
| N4 MAX_SESSIONS | Step 01 | ✅ |
| N5 MAX_MESSAGES | Step 01 | ✅ |
| E1 chat 먼저 도착 | Step 01 (upsert) | ✅ |
| E2 trim된 세션 복원 | Step 02 | ✅ |
| E3 백그라운드 전환 | Step 03 (cursor) | ✅ |
| E4 중복 메시지 | Step 01 (addMessage idempotent) | ✅ |
| E5 stale cursor | Step 03 (주석) | ✅ |
| E6 세션 0개 | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| Record\<sessionId, messages[]\> 구조 | Step 01 | ✅ |
| zustand persist + AsyncStorage | Step 01 | ✅ |
| currentSessionId 영속화 | Step 01 + Step 02 | ✅ |
| Stack Navigator in Tab | Step 02 | ✅ |
| discriminated union ChatMessage | Step 01 | ✅ |
| source 파라미터 전파 | Step 03 | ✅ |
| onToolStart/onToolDone 콜백 | Step 04 | ✅ |
| relay chatCursors polling | Step 03 | ✅ |
| addMessage 자동 upsert | Step 01 | ✅ |
| queued = 파생 UI 상태 | Step 01 (queuedMessageId) + Step 03 (UI) | ✅ |
| No Optional (createSession source 필수) | Step 01 | ✅ |

## Step 상세
- [Step 01: Store 재구조화 + 영속화](step-01-store-persist.md)
- [Step 02: 세션별 대화창](step-02-session-ui.md)
- [Step 03: 수신 흐름 + Cron + 오프라인 복구](step-03-daemon-events.md)
- [Step 04: Tool calls 실시간 표시](step-04-tool-calls.md)
