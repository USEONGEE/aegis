# 세션별 isLoading 분리 - v0.5.8

## 문제 정의

### 현상
- 세션 A에서 메시지를 전송하면, 응답이 올 때까지 세션 B에서도 메시지를 전송할 수 없다.
- 다른 세션으로 이동해도 전송 버튼이 로딩 스피너로 표시되고, 누르면 현재 세션이 아닌 원래 세션의 메시지를 취소하려 한다.

### 원인
- `useChatStore`에서 `isLoading`, `isTyping`, `queuedMessageId`, `messageState` 4개 상태가 단일 boolean/string으로 관리되어 모든 세션이 공유한다.
- `ChatDetailScreen`에서 이 글로벌 상태를 참조하여 전송 버튼 활성화/비활성화를 결정한다.

### 영향
- 멀티 세션 UX가 사실상 불가능: 한 세션의 AI 응답 대기가 모든 세션을 잠근다.
- 세션 B에서 전송 버튼을 누르면 세션 A의 메시지 취소가 실행되어 의도하지 않은 부작용 발생.

### 목표
- `isLoading`, `isTyping`, `queuedMessageId`, `messageState` 4개 transient 상태를 세션별로 독립 관리하여, 한 세션의 응답 대기가 다른 세션에 영향을 주지 않도록 한다.
- 각 세션은 독립적으로 전송/대기/취소가 가능하다.
- 동일 세션 내에서는 기존과 동일하게 단일 in-flight (한 번에 하나만 전송) 유지.

### 비목표 (Out of Scope)
- 타임아웃 추가 (daemon 무응답 시 isLoading 영구 잠금 방지) — 별도 Phase
- 동일 세션 내 다중 in-flight 허용 (같은 세션에서 동시에 여러 메시지 전송)
- Daemon/Relay 측 변경 — App 측 상태 관리만 수정

## 제약사항
- App 코드(packages/app)만 수정. Daemon/Relay 변경 없음.
- 기존 메시지 전송/취소/이벤트 처리 로직의 동작은 유지. 상태 스코프만 변경.
- 세션별로 분리해도 transient 상태는 persist 대상이 아니다 (앱 재시작 시 초기화).
