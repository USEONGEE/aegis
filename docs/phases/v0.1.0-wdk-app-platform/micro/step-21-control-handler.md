# Step 21: daemon - control_channel handler

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 16 (wdk-host), Step 20 (relay-client)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/control-handler.js` 생성. Relay의 control_channel을 통해 수신되는 SignedApproval을 처리한다. control_channel은 user 스코프로 전달되며 session과 무관하다 (DoD F39).

**처리 대상 메시지**:

| 메시지 타입 | 동작 |
|------------|------|
| `signed_approval` | SignedApproval을 broker.submitApproval()에 전달 |
| `device_pair_complete` | trustedApprovers에 새 디바이스 추가 |
| `device_revoke` | store.revokeDevice(deviceId) 호출 |

**SignedApproval 처리 흐름 (design.md Flow 2, Step ⑨~⑫)**:

```
① Relay control_channel에서 SignedApproval 수신
② E2E 복호화 (encrypted payload → SignedApproval JSON)
③ broker.submitApproval(signedApproval)
   → approval-verifier 6단계 검증
   → 성공 시 대기 중인 Promise resolve
④ resolve된 sendTransaction/transfer가 실행 재개
⑤ 실행 결과를 OpenClaw → Relay → RN App으로 전달
```

- `createControlHandler(broker, store, relayClient)`: 핸들러 생성
- `handle(message)`: control_channel 메시지 라우팅
- 에러 처리: submitApproval 실패 시 (UntrustedApproverError, DeviceRevokedError 등) 에러 로깅 + control_channel로 에러 응답 전송

## 2. 완료 조건
- [ ] `packages/daemon/src/control-handler.js` 에서 `createControlHandler` export
- [ ] `handle(message)` 가 `signed_approval` 타입 메시지를 broker.submitApproval()에 전달
- [ ] `handle(message)` 가 `device_pair_complete` 타입 메시지를 처리 (trustedApprovers 갱신)
- [ ] `handle(message)` 가 `device_revoke` 타입 메시지를 처리 (store.revokeDevice)
- [ ] submitApproval 성공 시 대기 중인 tx/policy 요청의 Promise가 resolve됨
- [ ] submitApproval 실패 시 에러 로깅 + control_channel로 에러 응답
- [ ] 알 수 없는 메시지 타입은 무시 (로그만 남김)
- [ ] relay-client의 onMessage에 control_handler.handle 연결
- [ ] `npm test -- packages/daemon` 통과 (control-handler 단위 테스트, mock broker/store/relay)

## 3. 롤백 방법
- `packages/daemon/src/control-handler.js` 삭제
- relay-client onMessage에서 control handler 연결 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  control-handler.js      # control_channel 메시지 처리
packages/daemon/tests/
  control-handler.test.js # 단위 테스트 (mock broker/store/relay)
```

### 수정 대상 파일
```
packages/daemon/src/index.js    # relay onMessage에 control handler 연결
```

### Side Effect 위험
- broker.submitApproval() 호출 → WDK 상태 변경 (approval 처리)
- store.revokeDevice() → DB 상태 변경

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| control-handler.js | control_channel 메시지 처리 | ✅ OK |
| control-handler.test.js | 단위 테스트 | ✅ OK |
| index.js 수정 | 핸들러 연결 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| signed_approval 처리 → submitApproval | ✅ control-handler.js | OK |
| device_pair_complete 처리 | ✅ control-handler.js | OK |
| device_revoke 처리 | ✅ control-handler.js | OK |
| 에러 처리 + 로깅 | ✅ control-handler.js | OK |
| 알 수 없는 메시지 무시 | ✅ control-handler.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 22: daemon - chat_queue handler](step-22-chat-handler.md)
