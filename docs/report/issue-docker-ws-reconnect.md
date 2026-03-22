# Docker 환경 WebSocket 재연결 + 메시지 전달 실패 문제

> docker compose rebuild 시 WS 연결 끊김, 응답 미표시, 메시지 중복, chain key 불일치 — 종합 이슈 리포트

---

## 개요

v0.5.5 OpenClaw 통합 과정에서 앱 채팅이 20회 이상 응답 없음 현상이 반복 발생. 원인은 단일 문제가 아니라 **5개 독립적 버그가 겹쳐** 있었다. 각각은 다른 레이어(Docker, relay, daemon, app)에서 발생하며, 하나를 고쳐도 다음 버그에 막혀 "여전히 안 됨"으로 보였다.

## 버그 목록 (발견 순서)

### Bug 1. Daemon 초기 relay 연결 — retry 없음

**증상**: `docker compose up --build -d` 시 daemon이 relay보다 먼저 부팅. `authenticateWithRelay()` 실패 시 재시도 없이 포기 → 영구 미연결.

**원인**: `index.ts`에서 catch 후 로그만 찍고 끝.

**수정**: 최대 10회, 3초 간격 retry loop 추가.

```typescript
// packages/daemon/src/index.ts
for (let attempt = 1; attempt <= MAX_RETRIES && !connected; attempt++) {
  try {
    const token = await authenticateWithRelay(...)
    relayClient.connect(relayWsUrl, token)
    connected = true
  } catch {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    }
  }
}
```

### Bug 2. Relay recreate → daemon dead socket

**증상**: relay rebuild 시 daemon의 WS가 끊기지만, daemon이 감지 못하고 dead socket 유지. chat forward 시 `userToDaemon` 매핑 소실.

**원인**: Docker 내부 네트워크에서 TCP FIN/RST 미전파. daemon의 WS heartbeat가 dead connection을 감지 못함.

**임시 해결**: relay rebuild 후 daemon도 반드시 restart.
```bash
docker compose up --build -d && docker compose restart daemon
```

**미해결**: daemon WebSocket ping/pong 타임아웃으로 근본 해결 필요.

### Bug 3. App RelayClient reconnect — 한 번 실패 시 영구 포기

**증상**: relay restart 후 앱의 reconnect가 한 번 실패하면 다시 시도 안 함.

**원인**: `scheduleReconnect()` → `doConnect()` 실패 → `return` (끝). 재시도 schedule 누락.

**수정**:
```typescript
// packages/app/src/core/relay/RelayClient.ts
try {
  await this.doConnect();
} catch (_err: unknown) {
  this.scheduleReconnect();  // ← 추가: 실패 시 다시 schedule
}
```

### Bug 4. ChatDetailScreen `done` 핸들러 — content 미표시 (핵심 버그)

**증상**: daemon이 OpenClaw 응답을 정상 수신, relay가 앱에 정상 전달, 하지만 **앱 화면에 아무것도 안 나옴**. 20회 이상 "응답 없음"의 실제 원인.

**원인**: v0.5.5에서 streaming 비활성화 후, `done` 이벤트에 최종 content가 담겨오지만 `done` 핸들러가 `addMessage()`를 호출하지 않았음. 이전에는 `stream` 이벤트로 content가 누적됐고 `done`은 마무리만 했지만, non-streaming 모드에서는 `done.content`가 **유일한** 응답 전달 경로.

**수정**:
```typescript
// packages/app/src/domains/chat/screens/ChatDetailScreen.tsx
case 'done': {
  // ...UI 상태 리셋...

  // IMPORTANT: non-streaming 모드에서는 done.content가 유일한 전달 경로.
  // streamMsgIdRef가 null이면 streaming이 없었다는 뜻 → content를 여기서 표시.
  if (data.content && !streamMsgIdRef.current) {
    addMessage({
      kind: 'text',
      id: message.messageId || `msg_${Date.now()}_...`,
      role: 'assistant',
      content: data.content,
      ...
    });
  }
}
```

### Bug 5. 메시지 중복 + Chain key 불일치

**증상 A**: 새 메시지 전송 시 이전 응답이 한번 더 표시됨.

**원인 A**: `addMessage`의 id에 랜덤 값(`msg_${Date.now()}`) 사용 → backfill/poll 이중 전달 시 같은 content가 다른 ID로 중복 추가.

**수정 A**: relay의 Redis entry ID (`message.messageId`)를 addMessage의 id로 사용. 같은 entry는 같은 ID → 덮어쓰기(idempotent).

**증상 B**: "지갑이 없다"고 답변 (실제로는 있음).

**원인 B**: WDK에 지갑이 chain key `'1'`로 등록됐는데, AI가 TOOLS.md 지시에 따라 `chain: "999"`로 호출 → 불일치.

**수정 B**: `wdk-host.ts`에서 `EVM_CHAIN_KEY = '999'`로 변경.

## 디버깅 타임라인

```
1. "안녕" 전송 → 응답 없음
   → relay 로그 확인: WS 메시지 수신 안 됨
   → 원인: daemon이 relay에 미연결 (Bug 1)
   → 수정: retry loop 추가

2. rebuild 후 재시도 → 응답 없음
   → relay 로그: 메시지 수신됨, daemon forward 실패
   → 원인: daemon dead socket (Bug 2)
   → 수정: daemon restart

3. daemon restart 후 재시도 → 응답 없음
   → relay 로그: forward 성공, daemon 로그: OpenClaw 응답 수신 (558자)
   → relay 로그: pollChatForApp delivering message, socketOpen: true
   → 원인: 앱이 받았지만 화면에 안 나옴 (Bug 4)
   → 수정: done 핸들러에 addMessage 추가

4. 수정 후 재시도 → 응답 표시됨! 하지만 중복 + 지갑 없다고 답변
   → 원인: 랜덤 ID로 중복 (Bug 5A) + chain key 불일치 (Bug 5B)
   → 수정: Redis entry ID 사용 + chain key '999'
```

## 적용된 수정 전체

| # | 파일 | 변경 | 상태 |
|---|------|------|------|
| 1 | `packages/daemon/src/index.ts` | relay 초기 연결 retry loop (10회, 3초) | ✅ |
| 2 | `packages/app/src/core/relay/RelayClient.ts` | reconnect 실패 시 재시도 | ✅ |
| 3 | `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` | 연결 끊김 시 빨간 배너 | ✅ |
| 4 | `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` | `done` 핸들러에서 non-streaming content 표시 | ✅ |
| 5 | `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` | addMessage id에 Redis entry ID 사용 (중복 방지) | ✅ |
| 6 | `packages/daemon/src/wdk-host.ts` | `EVM_CHAIN_KEY = '1'` → `'999'` | ✅ |

## 미해결 (후속 작업)

| 항목 | 설명 |
|------|------|
| Daemon heartbeat dead connection 감지 | relay 죽으면 daemon WS 끊김 감지 못함. WebSocket ping/pong 타임아웃 필요 |
| docker-compose depends_on 강화 | `daemon.depends_on.relay.condition: service_healthy` 추가 |
| Relay graceful shutdown | SIGTERM 시 모든 WS에 close frame 전송 |
| App reconnect 시 subscribedSessions 재구독 | reconnect 후 기존 세션의 poller가 없음 |

## 교훈

1. **streaming → non-streaming 전환 시 수신측 핸들러를 반드시 같이 수정**. 송신 포맷만 바꾸고 수신 로직을 안 바꾸면 "보내는 쪽은 성공, 받는 쪽은 무시"가 된다.
2. **Docker rebuild 시 WS 연결 상태를 신뢰하지 말 것**. TCP FIN이 전파 안 되면 dead socket이 무한정 유지된다.
3. **메시지 ID에 랜덤 값 사용 금지**. 멱등성이 필요한 시스템에서는 upstream의 유일한 ID (Redis entry ID)를 사용해야 한다.
4. **chain key 같은 하드코딩 값은 AI 도구 스키마(TOOLS.md)와 반드시 동기화**. 한쪽만 바꾸면 불일치로 "없다"가 된다.

---

**작성일**: 2026-03-23 02:30 KST
**갱신일**: 2026-03-23 03:15 KST — Bug 4, 5 추가, 디버깅 타임라인 추가
