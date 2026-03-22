# DoD (Definition of Done) - v0.5.8

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `useChatStore`에서 `isLoading`, `isTyping`, `queuedMessageId`, `messageState` 4개 글로벌 필드가 제거되고, `sessionTransient: Record<string, SessionTransientState>`로 대체됨 | `useChatStore.ts`에서 4개 글로벌 필드 grep 시 0건 |
| F2 | `getSessionTransient(sessionId)` 호출 시 해당 세션의 transient 상태를 반환하고, 존재하지 않는 세션 ID에 대해 `DEFAULT_SESSION_TRANSIENT`를 반환함 | 코드 리뷰: getter 구현 확인 |
| F3 | `setSessionTransient(sessionId, patch)`가 해당 세션의 상태만 업데이트하고 다른 세션의 상태에 영향 없음 | 코드 리뷰: setter가 `[sessionId]` 키만 변경하는지 확인 |
| F4 | `resetSessionTransient(sessionId)`가 해당 세션의 상태를 `DEFAULT_SESSION_TRANSIENT`로 초기화하고 다른 세션에 영향 없음 | 코드 리뷰: reset 구현 확인 |
| F5 | `ChatDetailScreen`에서 모든 transient 상태 읽기가 `currentSessionId` 기준으로 이루어짐 | 코드 리뷰: `getSessionTransient(currentSessionId)` 사용 확인 |
| F6 | `ChatDetailScreen`에서 모든 transient 상태 쓰기가 `currentSessionId`(또는 이벤트의 `sessionId`)를 키로 사용 | 코드 리뷰: `setSessionTransient(sessionId, ...)` 호출 확인 |
| F7 | `CancelCompleted`/`CancelFailed` 이벤트 핸들러가 어떤 세션의 상태/버퍼도 건드리지 않고 `return`만 수행 | 코드 리뷰: 해당 case문에 `return`만 있는지 확인 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 | `npx tsc --noEmit` (packages/app) |
| N2 | `sessionTransient`가 persist 대상에 포함되지 않음 | 코드 리뷰: `partialize` 함수에 `sessionTransient` 미포함 확인 |
| N3 | 기존 4개 setter(`setLoading`, `setTyping`, `setQueuedMessageId`, `setMessageState`)가 store 인터페이스에서 완전 제거됨 | `ChatState` 인터페이스에서 grep 시 0건 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 세션 A 로딩 중 세션 B로 전환 | 세션 B의 전송 버튼이 활성화 상태 | 수동 테스트 |
| E2 | 세션 A 로딩 중 세션 B에서 메시지 전송 후 세션 A로 복귀 | 세션 A가 여전히 로딩 상태 + 취소 버튼 표시 | 수동 테스트 |
| E3 | 존재하지 않는 세션 ID로 `getSessionTransient` 호출 | `DEFAULT_SESSION_TRANSIENT` 반환 (크래시 없음) | 코드 리뷰 |
| E4 | 세션 A 취소 직후 세션 B에서 응답 스트리밍 중 CancelCompleted(A) 도착 | 세션 B의 스트림이 끊기지 않음 | 수동 테스트 |
| E5 | MAX_SESSIONS 초과로 오래된 세션 제거 시 | 해당 세션의 `sessionTransient` 엔트리도 함께 삭제 | 코드 리뷰: 세션 트림 로직에 `sessionTransient` cleanup 포함 확인 |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 4개 transient 상태를 세션별 독립 관리 | F1, F2, F3, F4 | ✅ |
| 각 세션 독립적 전송/대기/취소 | F5, F6, E1, E2 | ✅ |
| 동일 세션 내 단일 in-flight 유지 | F5 (기존 로직 유지) | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| TD-1: SessionTransientState 타입 | F1 | ✅ |
| TD-2: Store 인터페이스 변경 | F1, F2, F3, F4, N3 | ✅ |
| TD-3: Getter fallback | F2, E3 | ✅ |
| TD-4: Persist 제외 | N2 | ✅ |
| TD-5: ChatDetailScreen 소비 패턴 | F5, F6 | ✅ |
| TD-6: 세션 트림 시 cleanup | E5 | ✅ |
| TD-7: CancelCompleted/CancelFailed 처리 | F7, E4 | ✅ |
