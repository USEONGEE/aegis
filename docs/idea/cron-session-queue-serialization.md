# Cron 동시 실행 시 세션 큐 직렬화 버그

> 같은 세션에 cron 2개가 동시 트리거되면 `SessionMessageQueue` FIFO 보장이 깨지고, App 화면에 응답 토큰이 인터리빙된다.

---

## 6하원칙

### Who (누가)
- 다음 세션 / daemon 패키지 담당
- 필요 접근: `packages/daemon/src/`

### What (무엇을)
- [ ] cron dispatch의 userId를 세션 소유자 userId로 변경 (큐 직렬화 복원)
- [ ] cron 식별 정보는 메시지 메타데이터로 분리 (source + cronId로 충분)
- [ ] 같은 세션에 cron 2개 동시 트리거 시 FIFO 동작 검증
- [ ] App 화면에서 cron 메시지 구분 UX 검토 (선택)

### When (언제)
- 선행 조건: 없음 (즉시 가능)
- 기한: 기한 없음. cron을 같은 세션에 2개 이상 등록하는 시나리오가 발생하면 우선순위 상승.

### Where (어디서)
| 파일 | 역할 |
|------|------|
| `packages/daemon/src/cron-scheduler.ts:166` | `userId = cron:${cronId}` — 문제의 원인 |
| `packages/daemon/src/index.ts:223-240` | `cronDispatch` — userId를 queueManager에 전달 |
| `packages/daemon/src/message-queue.ts:142-144` | `_queueKey()` — `${userId}:${sessionId}` 복합 키 |
| `packages/daemon/src/chat-handler.ts:68` | cron일 때 typing indicator skip 분기 |
| `packages/relay/src/routes/ws.ts:233,550-562` | Redis XADD/XREAD — 인터리빙 발생 지점 |
| `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx:243-285` | 메시지 렌더링 — 뒤섞인 토큰이 그대로 노출 |

### Why (왜)
**근본 원인**: `MessageQueueManager`의 큐 키가 `${userId}:${sessionId}`인데, cron의 userId가 `cron:${cronId}`로 cronId마다 다르다. 같은 세션이어도 큐가 분리되어 병렬 처리된다.

**안 고치면**:
1. 같은 세션에 cron 2개 → OpenClaw 병렬 호출 → 스트리밍 토큰이 Redis Stream에 인터리빙
2. App 화면에서 두 응답의 토큰이 뒤섞여 렌더링 (읽을 수 없는 메시지)
3. OpenClaw 세션 히스토리에도 인터리빙된 컨텍스트가 쌓여 AI 응답 품질 저하

**아키텍처 불일치**:
- `SessionMessageQueue`는 "세션 단위 FIFO"를 위해 설계됨
- 그런데 cron의 userId 분리가 이 FIFO를 우회함
- v0.4.8에서 확정한 "Redis Streams = SSOT" 원칙은 지켜지지만, 직렬화 계층에서 깨짐

### How (어떻게)

#### 방법 1 (권장): cron userId를 세션 소유자로 변경

```typescript
// cron-scheduler.ts — 현재
const userId = `cron:${cronId}`
await this._dispatch(cronId, cron.sessionId, userId, cron.prompt, cron.chain)

// 변경 후: 세션 소유자 userId를 store에서 조회
const sessionOwner = await this._store.getSessionOwner(cron.sessionId)
await this._dispatch(cronId, cron.sessionId, sessionOwner, cron.prompt, cron.chain)
```

장점: 큐 키가 `realUser:session1`로 통일 → 같은 세션의 모든 메시지(user/cron)가 FIFO.
단점: cron 메시지의 출처를 userId로 판별하던 곳이 있으면 수정 필요.
→ 이미 `source: 'cron'`과 `cronId` 필드가 있으므로 문제없음.

#### 방법 2: 큐 키에서 userId 제거

```typescript
// message-queue.ts — 현재
private _queueKey (userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`
}

// 변경 후
private _queueKey (_userId: string, sessionId: string): string {
  return sessionId
}
```

장점: 가장 단순한 변경.
단점: 다른 사용자가 같은 sessionId를 가질 경우 큐가 충돌. 현재 sessionId가 UUID이므로 실질적 문제는 없으나, 설계 의도(userId로 격리)를 무력화.

**권장: 방법 1**. source/cronId 메타데이터로 cron 식별을 유지하면서 큐 직렬화를 복원.

---

## 맥락

### 현재 상태
- `SessionMessageQueue`는 v0.3.0에서 도입 (composite key로 cross-user collision 방지)
- cron은 이후에 추가되면서 `cron:${cronId}` userId 패턴 도입
- 현재 cron 등록은 1세션 1cron이 대부분이라 실제 인터리빙은 미발생
- Redis Streams SSOT 원칙 (v0.4.8) 자체는 건재

### 사용자 확정 결정사항
- Cron 응답도 App 화면에 보여야 한다 (UIUX 일관성)
- 방법 1 (세션 소유자 userId) 방향 합의

### 영향 범위
| 계층 | 영향 |
|------|------|
| `SessionMessageQueue` | 큐 키 변경 → 같은 세션 모든 메시지 FIFO |
| Redis Stream | 변경 없음 (인터리빙 자체가 발생 안 함) |
| App 화면 | 변경 없음 (직렬화된 메시지가 순서대로 도착) |
| OpenClaw 히스토리 | 직렬화로 컨텍스트 오염 방지 |

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| Relay 채널 아키텍처 | CLAUDE.md "Relay 채널 아키텍처" 섹션 | Redis SSOT 원칙 |
| Chat Poller 전용 Redis | docs/idea/chat-poller-dedicated-redis-connection.md | 관련 poller 개선안 |

---

## 주의사항
- `cron:${cronId}` userId가 relay 쪽에서 라우팅에 사용되는지 확인 필요 (relay의 WS handler가 userId로 소켓 매핑하는 부분)
- cron 메시지의 `source: 'cron'` 필드는 유지해야 함 (typing indicator skip 등 분기에 사용 중)
- DaemonStore에 `getSessionOwner(sessionId)` 메서드가 없으면 추가 필요

## 시작 방법
```bash
# 영향 범위 확인
grep -rn 'cron:' packages/daemon/src/
grep -rn '_queueKey' packages/daemon/src/

# 구현 후 검증: 같은 세션에 cron 2개 등록 → tick() 트리거 → 메시지 순서 확인
```
