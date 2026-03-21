# App 채팅 UX 완성 - v0.3.1

## 문제 정의

### 현상
Daemon 채팅 인프라(relay 통신, 큐 처리, cron 스케줄링)는 완성되어 있으나, App 측 UX가 5개 영역에서 미완성:

| # | 항목 | 현재 상태 |
|---|------|----------|
| 1 | 세션별 대화창 | 단일 세션만 표시 — 세션 목록/전환 UI 없음 |
| 2 | Tool calls 실시간 표시 | 메타데이터 필드만 존재 — 실제 렌더링 없음 |
| 3 | Cron 메시지 표시 | 핸들러 없음 — source 태그 전파 안 됨 |
| 4 | 메시지 수신 흐름 UX | queued 상태 UI 미표시 + cancelled 이벤트 미반영 |
| 5 | 대화 이력 영속성 | 메모리만 — 앱 재시작 시 전체 소실 |

### 원인
- **Store 구조**: `useChatStore`가 단일 세션 + 메모리 전용으로 설계됨. persist 미들웨어 미적용, 세션별 메시지 분리 없음.
- **Daemon→App 전파 갭**: `_processChatDirect()`가 `source` 파라미터를 받지 않아 cron/user 구분이 relay 메시지에 포함 안 됨.
- **콜백 부재**: `processChat()`에 tool 실행 콜백(`onToolStart`/`onToolDone`)이 없어 tool 상태를 relay로 전달 불가.
- **UI 미표시**: `message_queued` 핸들러는 존재하나 사용자에게 상태를 표시하지 않음. `cancelled` 이벤트는 chat 채널에서 화면에 미반영.
- **콜백 누락(tool)**: App의 relay 메시지 핸들러에 `tool_start`, `tool_done` case가 없음.

### 영향
- **사용자**: 앱 재시작 시 대화 이력 전체 소실. 다중 세션 관리 불가. AI의 도구 실행 상태를 알 수 없음.
- **Cron 기능**: Daemon에서 cron이 실행되어도 App에서 결과를 볼 수 없음 — cron 기능이 사실상 무용.
- **신뢰성**: 메시지 큐잉/취소 상태가 표시되지 않아 사용자가 시스템 상태를 알 수 없음.

### 목표
1. **대화 이력 영속성**: 앱 재시작 후에도 모든 세션의 메시지가 유지됨
2. **멀티 세션 UI**: 세션 목록 화면에서 세션 간 전환 가능
3. **메시지 수신 흐름 완성**: queued 상태가 UI에 표시되고, cancelled 이벤트가 화면에 반영됨
4. **Cron 메시지 전파**: Daemon→App source 태그 전파 + cron 세션 구분 표시
5. **Tool call 실시간 표시**: 도구 실행 시작/완료/실패가 실시간 표시됨
6. **오프라인 cron 응답 복구**: 앱 종료 중 발생한 cron 응답을 재시작 시 relay에서 수신하여 표시

### 비목표 (Out of Scope)
- 대화 이력 서버 동기화 (로컬 영속성만)
- 세션 삭제/편집 UI
- 메시지 검색 기능
- 메시지 페이지네이션 (대량 이력 최적화)
- Tool call 상세 결과 표시 (실행 여부만, 결과 내용은 아님)

### 설계 결정 (확정)
- **앱 재시작 진입점**: `currentSessionId`를 영속화하여 마지막 세션으로 직접 복원 (세션 목록 거치지 않음)
- **범위**: 이번 Phase는 App UX뿐 아니라 daemon↔app chat/control 이벤트 계약 변경을 포함

## 제약사항
- **기술적**: Expo + React Native 환경. AsyncStorage 기반 영속화. zustand persist 미들웨어 사용.
- **의존성**: Daemon v0.2.9+v0.2.10+v0.2.11 리팩토링 완료 상태 기반.
- **구현 순서**: 5(영속성) → 1(세션 UI) → 4(수신 흐름) → 3(cron) → 2(tool calls) 순서로 진행 권장 — Store 구조가 나머지 항목의 기반.
