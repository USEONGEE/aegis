# Step 02: Daemon→App Chat Poller

## 구현 내용
App이 `subscribe_chat`으로 세션을 구독하면, 해당 chat stream을 지속적으로 polling하여 daemon이 보낸 메시지를 App에 전달한다.

## Scope
- **수정 파일**: `packages/relay/src/routes/ws.ts`
- **수정 위치 1**: `subscribe_chat` 핸들러 (line 321-326) — backfill 후 지속 polling 시작
- **수정 위치 2**: 새 함수 `pollChatForApp()` 추가 — `pollControlForApp()` 패턴 기반
- **수정 위치 3**: App disconnect 시 chat poller AbortController 정리

## 완료 조건
- [ ] Daemon이 chat 응답(stream/done/error) 전송 → App UI에 표시됨
- [ ] sender=app 메시지는 App에 다시 전달되지 않음 (echo 방지)
- [ ] App 재연결 시 이전 poller 정리 + 새 poller 시작
- [ ] subscribe_chat 전에 도착한 메시지는 backfill로 수신
