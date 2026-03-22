# Step 01: App→Daemon Chat 직접 전달

## 구현 내용
App이 chat 메시지를 보내면 Redis Stream에 저장 후, 해당 userId에 바인딩된 daemon의 WebSocket으로 직접 forward한다.

## Scope
- **수정 파일**: `packages/relay/src/routes/ws.ts`
- **수정 위치**: App 메시지 핸들러의 `chat` 분기 (line 352-372)
- **변경 내용**: Redis 저장 후 daemon WebSocket으로 forward 추가

## 완료 조건
- [ ] App에서 chat 전송 → daemon 로그에 chat handler 진입 확인
- [ ] Redis Stream에도 엔트리 저장됨
- [ ] 기존 Control/Query 동작 영향 없음
