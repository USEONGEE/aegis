# Step 36: app - RelayClient

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 35 (E2ECrypto)

---

## 1. 구현 내용 (design.md + PRD 기반)

RN App용 RelayClient — WebSocket (foreground) + REST + 자동 재연결 + cursor sync.

- `src/core/relay/RelayClient.ts`: Relay 서버와의 통신 클라이언트

**WebSocket (foreground)**:
- Relay `/ws/app` 엔드포인트 연결
- authenticate 메시지 (JWT) 전송 → userId 매핑
- control_channel + chat_queue 메시지 수신
- 메시지 전송 (SignedApproval, 채팅 등)

**REST (인증)**:
- `POST /api/auth/login` → JWT 획득
- `POST /api/auth/pair` → 디바이스 등록
- `POST /api/auth/refresh` → JWT 갱신

**자동 재연결**:
- WebSocket 끊김 시 exponential backoff로 재연결
- 마지막 수신 Stream ID (cursor) 저장
- 재연결 시 cursor 이후 누락 메시지 수신

**메시지 구조**:
- E2ECrypto로 payload 암호화/복호화
- `{ channel: 'control'|'chat', sessionId?, payload: encrypted, messageId, timestamp }`

## 2. 완료 조건
- [ ] `src/core/relay/RelayClient.ts` 생성
- [ ] `connect(relayUrl, jwt)` → WebSocket 연결 + authenticate 메시지
- [ ] `disconnect()` → WebSocket 종료
- [ ] `sendControl(payload)` → control_channel에 E2E 암호화 메시지 전송
- [ ] `sendChat(sessionId, payload)` → chat_queue에 E2E 암호화 메시지 전송
- [ ] `onControl(callback)` → control_channel 메시지 수신 콜백 등록
- [ ] `onChat(callback)` → chat_queue 메시지 수신 콜백 등록
- [ ] WebSocket 끊김 → exponential backoff 재연결 (1초 → 2초 → 4초 → 최대 30초)
- [ ] 재연결 시 마지막 cursor 이후 메시지 수신
- [ ] REST: `login(userId, password)` → JWT 반환
- [ ] REST: `pair(pairingCode, publicKey)` → device 등록 + JWT 반환
- [ ] REST: `refreshToken()` → 새 JWT 반환
- [ ] JWT 만료 시 자동 refresh → 실패 시 로그아웃 콜백
- [ ] E2ECrypto 연동: 전송 시 encrypt, 수신 시 decrypt
- [ ] 단위 테스트: connect/disconnect, send/receive (WebSocket mock), reconnect

## 3. 롤백 방법
- `src/core/relay/RelayClient.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/core/relay/
    RelayClient.ts                 # WebSocket + REST + reconnect
  tests/
    relay-client.test.ts           # RelayClient 단위 테스트 (WS mock)
```

### 수정 대상 파일
```
없음
```

### Side Effect 위험
- 없음 (신규 모듈)
- E2ECrypto (Step 35) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| RelayClient.ts | WS + REST + reconnect | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| WebSocket 연결 | ✅ RelayClient.ts | OK |
| REST 인증 | ✅ RelayClient.ts | OK |
| exponential backoff | ✅ RelayClient.ts | OK |
| cursor sync | ✅ RelayClient.ts | OK |
| E2E encrypt/decrypt 연동 | ✅ RelayClient.ts | OK |
| JWT refresh | ✅ RelayClient.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 37: app - SignedApprovalBuilder](step-37-signed-approval-builder.md)
