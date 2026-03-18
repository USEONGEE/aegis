# Step 20: daemon - Relay WebSocket client

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 15 (daemon-setup, config)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/relay-client.js` 생성. daemon에서 Relay 서버로의 outbound WebSocket 연결을 관리한다. NAT/방화벽 뒤에서도 동작하기 위해 daemon이 클라이언트로 연결한다 (DoD F37).

- `createRelayClient(config)`: WebSocket 클라이언트 생성
  - `connect()`: Relay URL로 연결 → authenticate 메시지 전송 (`{ type: 'authenticate', payload: { userId, token } }`)
  - `disconnect()`: 정리 후 연결 종료
  - `send(channel, payload, sessionId?)`: 메시지 전송 (`{ channel, sessionId, payload }`)
  - `onMessage(handler)`: 메시지 수신 콜백 등록

- **재연결 로직** (DoD F41):
  - exponential backoff: 1s → 2s → 4s → 8s → 16s → 최대 30s
  - jitter 추가 (0~1s 랜덤)
  - 재연결 시 마지막 수신 Stream ID 전달 → 누락 메시지 수신
  - 최대 재시도 없음 (daemon 생존 기간 동안 무한 재시도)

- **이벤트**: `connected`, `disconnected`, `reconnecting`, `error`
- **heartbeat**: 30초마다 ping, 60초 내 pong 없으면 연결 끊김으로 판단

## 2. 완료 조건
- [ ] `packages/daemon/src/relay-client.js` 에서 `createRelayClient` export
- [ ] `connect()` 호출 시 `config.relayUrl`로 WebSocket 연결
- [ ] 연결 후 authenticate 메시지 자동 전송
- [ ] `send(channel, payload, sessionId)` 로 메시지 전송
- [ ] `onMessage(handler)` 로 수신 메시지 콜백 등록
- [ ] 연결 끊김 시 exponential backoff 재연결 (1s → 2s → 4s → 8s → 16s → max 30s)
- [ ] backoff에 jitter (0~1s) 추가
- [ ] 재연결 시 마지막 Stream ID 전달
- [ ] 30초 heartbeat ping, 60초 pong 타임아웃
- [ ] `disconnect()` 호출 시 재연결 중단 + 연결 종료
- [ ] `npm test -- packages/daemon` 통과 (relay-client 단위 테스트, mock WebSocket)

## 3. 롤백 방법
- `packages/daemon/src/relay-client.js` 삭제
- `index.js`에서 relay-client import/호출 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  relay-client.js         # Relay outbound WebSocket + 재연결
packages/daemon/tests/
  relay-client.test.js    # 단위 테스트 (mock WebSocket)
```

### 수정 대상 파일
```
packages/daemon/src/index.js    # relay-client 초기화 + connect() 호출 추가
```

### Side Effect 위험
- 네트워크 연결 (Relay WebSocket). 테스트에서는 mock 사용

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| relay-client.js | outbound WebSocket + 재연결 | ✅ OK |
| relay-client.test.js | 단위 테스트 | ✅ OK |
| index.js 수정 | 초기화 연결 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| connect / disconnect | ✅ relay-client.js | OK |
| send / onMessage | ✅ relay-client.js | OK |
| exponential backoff + jitter | ✅ relay-client.js | OK |
| heartbeat (ping/pong) | ✅ relay-client.js | OK |
| 마지막 Stream ID 기반 누락 복구 | ✅ relay-client.js | OK |
| authenticate 메시지 | ✅ relay-client.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 21: daemon - control_channel handler](step-21-control-handler.md)
