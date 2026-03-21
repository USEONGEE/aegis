# Relay 오프라인 Cron 복구 통합 - v0.3.3

## 문제 정의

### 현상
v0.3.1(App Chat UX)에서 오프라인 cron 복구를 구현했으나, v0.3.0(Relay Daemon Multiplex)이 relay ws.ts를 완전히 새로 작성하면서 v0.3.1이 추가했던 relay 측 기능이 누락됨.

현재 상태:
- **App (구현됨)**: RelayClient가 authenticate에 `chatCursors` 전송 + `subscribeChatStream()` 메서드 + RootNavigator의 `cron_session_created` 핸들러
- **Daemon (구현됨)**: `cron_session_created` control 이벤트 전송 + source 태그 전파
- **Relay (누락됨)**: `chatCursors` 파싱 없음, `subscribe_chat` 핸들러 없음, `backfillChatStream` 함수 없음

### 원인
v0.3.0과 v0.3.1이 병렬로 개발됨. v0.3.0이 relay ws.ts를 multiplex 아키텍처로 전면 재작성하면서 v0.3.1이 기존 ws.ts에 추가한 코드(chatCursors, subscribe_chat, backfillChatStream)가 덮어씌워짐.

### 영향
- 앱이 종료된 동안 daemon cron이 실행한 AI 응답을 앱 재시작 시 수신할 수 없음
- App이 `subscribeChatStream()`을 보내면 relay에서 unknown type 에러
- DoD F30~F34, E3, E5 미충족

### 목표
v0.3.0 multiplex relay 구조 위에 v0.3.1의 오프라인 cron 복구 기능을 통합:
1. relay `handleAppConnection`에서 authenticate 시 `chatCursors` 파싱 + per-session chat stream polling
2. relay에 `subscribe_chat` 메시지 핸들러 추가 → `backfillChatStream` (one-shot) 실행
3. end-to-end: 앱 종료 중 cron 실행 → 앱 재시작 → 세션 목록에 cron 세션 + AI 응답 표시

### 비목표 (Out of Scope)
- App 측 코드 변경 (이미 구현됨 — chatCursorsProvider, subscribeChatStream, syncHandler)
- Daemon 측 코드 변경 (이미 구현됨 — cron_session_created 전송)
- 대화 이력 서버 동기화 (로컬 영속성만)

## 제약사항
- relay ws.ts의 v0.3.0 multiplex 구조(handleDaemonConnection + handleAppConnection + pollControlForApp)를 유지
- 기존 즉시 forward 경로와 충돌하지 않도록 one-shot backfill 패턴 사용
