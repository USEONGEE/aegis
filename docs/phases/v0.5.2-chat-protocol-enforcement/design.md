# 설계 - v0.5.2

## 변경 규모
**규모**: 작은 변경
**근거**: 단일 파일(RelayClient.ts) 시그니처 변경 + 3개 call site 수정

---

## 문제 요약
`sendChat()`이 `unknown` payload를 받아 화면별로 다른 비프로토콜 형식이 퍼져 있음. `text: string`으로 시그니처를 변경하고 내부에서 `RelayChatInput`을 조립.

> 상세: [README.md](README.md) 참조

## 접근법
`sendChat(sessionId, payload: unknown)` → `sendChat(sessionId, text: string)`로 변경. 내부에서 `RelayChatInput`을 조립하여 `buildEnvelope`에 전달.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `sendChat(input: RelayChatInput)` | 타입 완전 강제 | 호출자가 userId/sessionId를 직접 조합해야 함 | ❌ |
| B: `sendChat(sessionId, text: string)` | 호출자 단순, RelayClient가 보강 | RelayChatInput과 1:1 대응 아님 | ✅ |

**선택 이유**: RelayClient는 이미 `userId`를 내부 상태로 갖고 있고, `sessionId`는 첫 번째 인자로 받음. 호출자가 `text`만 넘기면 충분.

## 기술 결정
1. `RelayClient.sendChat(sessionId: string, text: string)` — 시그니처 변경
2. 내부: `import { RelayChatInput } from '@wdk-app/protocol'` → `const input: RelayChatInput = { userId: this.userId, sessionId, text }` → `buildEnvelope('chat', input, { sessionId })`
3. Call site 3곳 수정: ChatDetailScreen, DashboardScreen, SettingsScreen

## 테스트 전략
- 수동 E2E: App에서 채팅 전송 → Daemon 수신 확인
- tsc --noEmit: 컴파일 타임 타입 체크
