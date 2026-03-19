# Step 31: relay - Expo Push Notifications

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 27 (PgRegistry — push_token 저장), Step 29 (WS 서버)

---

## 1. 구현 내용 (design.md 기반)

Expo Push Notifications를 통한 RN App wake-up. 승인 요청 등 중요 이벤트 발생 시, app이 background/offline이면 푸시 알림을 보낸다.

- `src/routes/push.js`: 푸시 알림 발송 로직
- Expo Push API (`https://exp.host/--/api/v2/push/send`) 호출
- device의 `push_token`을 PgRegistry에서 조회

**발송 트리거** (ws.js 연동):
- daemon이 control_channel에 승인 요청(tx_approval, policy_approval) 전송 시
- 해당 userId의 app 디바이스가 WS 연결 상태가 아닌 경우
- push_token이 등록된 디바이스에 푸시 전송

**푸시 payload**:
```json
{
  "to": "ExponentPushToken[xxx]",
  "title": "Approval Required",
  "body": "Transaction approval requested",
  "data": { "type": "tx_approval", "requestId": "req_123" }
}
```

## 2. 완료 조건
- [ ] `src/routes/push.js`에서 `sendPushNotification(userId, notification)` 함수 export
- [ ] PgRegistry에서 userId의 app 디바이스 push_token 조회
- [ ] push_token이 없으면 푸시 스킵 (에러 아님)
- [ ] Expo Push API 호출 (`POST https://exp.host/--/api/v2/push/send`)
- [ ] 푸시 실패 시 에러 로깅 (throw하지 않음 — 푸시는 best-effort)
- [ ] WebSocket 연결 상태인 app 디바이스에는 푸시 미발송 (불필요)
- [ ] ws.js에서 control_channel 승인 요청 시 push 함수 호출 연동
- [ ] `npm test -- packages/relay` 통과 (push 단위 테스트 — Expo API mock)

## 3. 롤백 방법
- `src/routes/push.js` 삭제
- ws.js에서 push 호출 코드 제거

---

## Scope

### 신규 생성 파일
```
packages/relay/
  src/routes/
    push.js                        # 푸시 알림 발송
  tests/
    push.test.js                   # 푸시 단위 테스트 (Expo API mock)
```

### 수정 대상 파일
```
packages/relay/src/routes/ws.js    # control 메시지 전달 시 push 호출 연동
packages/relay/package.json        # expo-server-sdk 또는 node-fetch 의존성
```

### Side Effect 위험
- ws.js 수정 — 기존 메시지 라우팅에 push 호출 추가
- Expo Push API 외부 의존 (테스트는 mock)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| routes/push.js | 푸시 알림 발송 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| sendPushNotification 함수 | ✅ push.js | OK |
| Expo Push API 호출 | ✅ push.js | OK |
| WS 연결 상태 체크 | ✅ ws.js 연동 | OK |
| push_token 조회 | ✅ push.js + PgRegistry | OK |

### 검증 통과: ✅

---

→ 다음: [Step 32: relay - 통합 테스트](step-32-relay-integration-tests.md)
