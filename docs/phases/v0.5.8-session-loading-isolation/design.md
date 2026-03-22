# 설계 - v0.5.8

## 변경 규모
**규모**: 일반 기능
**근거**: 2개 파일 수정 (useChatStore.ts, ChatDetailScreen.tsx) + 내부 API(store 인터페이스) 변경

---

## 문제 요약
isLoading, isTyping, queuedMessageId, messageState 4개 transient 상태가 글로벌 단일 값이라 한 세션의 응답 대기가 모든 세션을 잠근다.

> 상세: [README.md](README.md) 참조

## 접근법

4개 글로벌 transient 필드를 `sessionTransient: Record<string, SessionTransientState>`로 통합하여, 세션 ID를 키로 독립 관리한다. 기존 `sessions: Record<string, ChatMessage[]>`, `streamCursors: Record<string, string>` 패턴을 그대로 따른다.

## 범위 / 비범위

**범위 (In Scope)**:
- useChatStore: 4개 글로벌 필드 → `sessionTransient` Record 전환
- ChatDetailScreen: 모든 setter/getter를 세션 키 기반으로 전환
- CancelCompleted/CancelFailed 이벤트의 세션 식별 규칙 추가

**비범위 (Out of Scope)**:
- Daemon/Relay 프로토콜 변경
- 타임아웃 로직 추가
- RootNavigator, ChatListScreen (transient 상태 미사용 확인 완료)

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: Store Record Map (`sessionTransient: Record<string, T>`) | 기존 패턴(`sessions`, `streamCursors`) 일치, 화면 언마운트에도 상태 유지, 외부 읽기 가능 | setter에 sessionId 파라미터 추가 필요 | ✅ |
| B: Component-local useState | 가장 단순, store 축소 | 화면 전환 시 상태 소실 (로딩 중 세션 목록 갔다 오면 로딩 표시 사라짐), 이벤트 핸들러가 언마운트 상태에서 상태 업데이트 불가 | ❌ |
| C: 세션별 별도 zustand store (Factory) | 완전 격리 | 과도한 복잡도, 코드베이스에 선례 없음, 라이프사이클 관리 부담 | ❌ |

**선택 이유**: A — 화면 전환 시 상태 유실이 없고, 기존 `Record<string, T>` 패턴을 그대로 따르며, 이벤트가 화면 언마운트 중 도착해도 store에서 상태 업데이트 가능.

## 기술 결정

### TD-1: SessionTransientState 타입

```typescript
interface SessionTransientState {
  isLoading: boolean;
  isTyping: boolean;
  queuedMessageId: string | null;
  messageState: 'idle' | 'queued' | 'active';
}

const DEFAULT_SESSION_TRANSIENT: SessionTransientState = {
  isLoading: false,
  isTyping: false,
  queuedMessageId: null,
  messageState: 'idle',
};
```

### TD-2: Store 인터페이스 변경

**제거**: `isLoading`, `isTyping`, `queuedMessageId`, `messageState` (4개 필드)
**제거**: `setLoading`, `setTyping`, `setQueuedMessageId`, `setMessageState` (4개 setter)
**추가**:
```typescript
sessionTransient: Record<string, SessionTransientState>;
getSessionTransient: (sessionId: string) => SessionTransientState;
setSessionTransient: (sessionId: string, patch: Partial<SessionTransientState>) => void;
resetSessionTransient: (sessionId: string) => void;
```

`Partial<SessionTransientState>`는 setter 파라미터 (도메인 타입이 아님). zustand merge-patch 표준 패턴.

### TD-3: Getter fallback

```typescript
getSessionTransient: (sessionId) =>
  get().sessionTransient[sessionId] ?? DEFAULT_SESSION_TRANSIENT
```

존재하지 않는 세션 ID → 안전하게 기본값 반환.

### TD-4: Persist 제외

`partialize`는 이미 명시적 포함 목록 방식 → `sessionTransient`를 목록에 안 넣으면 끝. 코드 변경 불필요.

### TD-5: ChatDetailScreen 소비 패턴

```typescript
// 읽기 (zustand selector):
const { isLoading, isTyping, queuedMessageId, messageState } =
  useChatStore(s => s.getSessionTransient(currentSessionId));

// 쓰기:
const setSessionTransient = useChatStore(s => s.setSessionTransient);
setSessionTransient(currentSessionId, { isLoading: true });

// 리셋:
const resetSessionTransient = useChatStore(s => s.resetSessionTransient);
resetSessionTransient(currentSessionId);
```

### TD-6: 세션 트림 시 cleanup

`addMessage` 내 `MAX_SESSIONS` 초과 시 오래된 세션 제거 로직에서 `sessionTransient` 엔트리도 함께 삭제.

### TD-7: CancelCompleted/CancelFailed 세션 식별

현재 `CancelCompleted`/`CancelFailed` 이벤트에는 `sessionId`가 없다 (Daemon/Relay 변경은 비목표).
해결 규칙: `sessionTransient`를 순회하여 `queuedMessageId`가 일치하는 세션을 찾아 리셋한다.

```typescript
case 'CancelCompleted':
case 'CancelFailed': {
  // sessionId 없는 이벤트 → queuedMessageId로 세션 역조회
  const transients = get().sessionTransient;
  for (const [sid, state] of Object.entries(transients)) {
    if (state.queuedMessageId != null) {
      resetSessionTransient(sid);
    }
  }
  streamBufferRef.current = '';
  streamMsgIdRef.current = null;
  return;
}
```

세션 수가 소수(< 10)이므로 순회 비용 무시 가능. 실질적으로 `queuedMessageId`가 설정된 세션은 항상 1개 (동일 세션 내 단일 in-flight).

## 테스트 전략

수동 검증:
1. 세션 A에서 메시지 전송 → 세션 B로 이동 → 전송 버튼 활성 상태 확인
2. 세션 B에서 메시지 전송 → 세션 A로 돌아오기 → 세션 A 로딩 상태 유지 확인
3. 로딩 중 세션 전환 후 복귀 → 로딩 표시 유지 + 취소 버튼 동작 확인
4. tsc 통과 확인

## 마이그레이션

N/A: transient 상태는 persist 대상이 아니므로 마이그레이션 불필요. 앱 재시작 시 모든 세션이 idle로 초기화.
