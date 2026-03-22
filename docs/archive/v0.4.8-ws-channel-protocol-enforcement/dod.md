# DoD (Definition of Done) - v0.4.8

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | cancel_queued/cancel_active의 결과가 CancelCompleted/CancelFailed 이벤트로 반환됨 | `npm test --workspace=packages/daemon` — control-handler cancel 테스트 통과 |
| F2 | ControlResult 타입이 protocol에서 완전히 제거됨 | `grep -r 'ControlResult' packages/protocol/src/` 결과 0건 |
| F3 | index.ts가 cancel 결과를 event_stream 채널로 전송 | `npm test --workspace=packages/daemon` — index.ts send('event_stream', ...) 호출 assertion |
| F4 | relay 영속 채널 직접 forward 제거, Redis 단일 경로 | `grep -n 'send(ds.socket\|send(appSocket' packages/relay/src/routes/ws.ts` — query 직접 전달만 존재, 영속 채널 0건 |
| F5 | relay poller가 sender=daemon 메시지를 WS type='event_stream'으로 변환 | `npm test --workspace=packages/relay` — pollControlForApp 변환 테스트 통과 |
| F6 | protocol에 QueryType(4종), QueryMessage DU, QueryResult(ok\|error) 정의됨 | `npx tsc --noEmit -p packages/protocol` 통과 + `test -f packages/protocol/src/query.ts` |
| F7 | relay에서 query가 Redis 미경유, daemon 소켓에 직접 전달 | `npm test --workspace=packages/relay` — query 라우팅 테스트: queue.publish 미호출 assertion |
| F8 | daemon 오프라인 시 relay가 query_result(error='daemon_offline') 평문 응답 | `npm test --workspace=packages/relay` — daemon 소켓 없을 때 에러 응답 assertion |
| F9 | daemon query-handler가 4종 query → QueryResult 반환 | `npm test --workspace=packages/daemon` — query-handler 4종 정상/에러 테스트 통과 |
| F10 | app RelayClient.query()가 requestId 기반 Promise + timeout 동작 | `npx tsc --noEmit -p packages/app` 통과 + 수동 검증: RelayClient.ts에서 (1) query()가 randomId 생성 → pendingQueries.set() → ws.send() → setTimeout() 순서로 동작, (2) onMessage에서 query_result 수신 시 pendingQueries.get(requestId) → resolve/reject 호출 확인 |
| F11 | daemon send()에 채널별 타입 오버로드 (chat, event_stream, query_result) | `npx tsc --noEmit -p packages/daemon` 통과 — 기존 호출부 전체가 오버로드 시그니처에 맞아야 컴파일 성공 |
| F12 | daemon chat-handler.ts에서 ChatEvent 타입 import + 적용 | `grep 'ChatEvent' packages/daemon/src/chat-handler.ts` — import 존재 + tsc 통과 |
| F13 | ControlEvent가 완전히 제거됨. MQ/MS/CSC가 events.ts로 이동. EventStreamPayload가 events.ts에 독립. AnyStreamEvent가 AnyWDKEvent+DaemonEvent+MQ/MS/CSC 포함. | `grep 'ControlEvent' packages/protocol/src/control.ts` 0건 + `grep 'AnyStreamEvent' packages/protocol/src/events.ts`에 MQ/MS/CSC 포함 + `grep 'EventStreamPayload' packages/protocol/src/events.ts` 1건+ |
| F14 | RelayChannel = 5종 ('control' \| 'chat' \| 'event_stream' \| 'query' \| 'query_result') | `grep "event_stream.*query.*query_result" packages/protocol/src/relay.ts` — 5종 리터럴 존재 |
| F15 | relay ws.ts가 protocol 타입을 import하여 wire↔protocol 변환에 사용 | `npx tsc --noEmit -p packages/relay` 통과 + `grep 'import.*@wdk-app/protocol' packages/relay/src/routes/ws.ts` — import 존재 |
| F16 | app RelayClient에서 EventStreamPayload, QueryResult 타입으로 typed handling | `npx tsc --noEmit -p packages/app` 통과 + 수동 검증: onMessage에서 channel='event_stream' 분기가 EventStreamPayload 기반, channel='query_result' 분기가 QueryResult 기반으로 처리되는 구조 확인 |
| F17 | daemon query_result가 기존 E2E 암호화 규칙 적용 | `npm test --workspace=packages/daemon` — relay-client send('query_result') 시 sessionKey 존재하면 encrypted=true인 envelope assertion |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 모든 패키지 TypeScript strict 모드 에러 0 | `npx tsc --noEmit -p packages/protocol && npx tsc --noEmit -p packages/daemon && npx tsc --noEmit -p packages/relay && npx tsc --noEmit -p packages/app` |
| N2 | 기존 테스트 전체 통과 (회귀 없음) | `npm test --workspace=packages/daemon && npm test --workspace=packages/relay` |
| N3 | send() 오버로드가 잘못된 payload 거부 | `packages/daemon/tests/type-check.ts` compile-fail fixture: `send('chat', { wrong: true })` 같은 의도적 타입 불일치 코드가 `// @ts-expect-error`로 마킹되어 tsc 통과. expect-error 없이는 컴파일 에러 발생 확인. |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | daemon 오프라인 + app query | relay가 query_result(error='daemon_offline') 평문 즉시 응답 | `npm test --workspace=packages/relay` — daemon 소켓 없는 상태 query 수신 테스트 |
| E2 | query timeout (10초) | app pendingQueries에서 reject(timeout) | `npx tsc --noEmit -p packages/app` 통과 + 수동 검증: query() 내부에서 setTimeout(timeoutMs) → pendingQueries.delete(requestId) → reject(Error) 순서 확인 |
| E3 | cancel_queued messageId 미존재 | CancelFailed(reason='not_found') 반환 | `npm test --workspace=packages/daemon` — cancel not_found 테스트 케이스 통과 |
| E4 | 직접 forward 제거 후 실시간성 | poller XREAD BLOCK 실시간 전달 | 검증 완료 — `redis-queue.ts:75` XREAD BLOCK 사용 확인됨 |
| E5 | daemon query_result + sessionKey | encrypted=true envelope | `npm test --workspace=packages/daemon` — relay-client 암호화 테스트에서 query_result envelope assertion |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 채널 단방향 통일 | F1, F2, F3, F5, F13 | ✅ |
| 단일 전달 경로 | F4 | ✅ |
| query 채널 신설 | F6, F7, F8, F9, F10, F14, F17 | ✅ |
| protocol 타입 강제 | F11, F12, F13, F14, F15, F16 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| CancelCompleted/CancelFailed → events.ts, AnyStreamEvent | F1, F3, F13 | ✅ |
| query.ts 신규 파일 | F6 | ✅ |
| RelayChannel 확장 | F14 | ✅ |
| event_stream top-level 승격 | F5, F13 | ✅ |
| query WS 직접 전달 | F7, F8 | ✅ |
| send() 오버로드 | F11, N3 | ✅ |
| query_result ok\|error DU | F6, F9 | ✅ |
| daemon_offline 평문 예외 (relay만) | F8, E1 | ✅ |
| daemon query_result E2E 암호화 | F17, E5 | ✅ |
| relay wire↔protocol 변환 | F15 | ✅ |
| app protocol 타입 적용 | F16 | ✅ |
