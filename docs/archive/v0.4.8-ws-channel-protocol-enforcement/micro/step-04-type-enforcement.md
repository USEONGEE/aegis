# Step 04: protocol 타입 강제 적용

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01, Step 03

---

## 1. 구현 내용 (design.md Phase E)

1. `daemon/src/relay-client.ts` — send() 채널별 타입 오버로드 (chat, event_stream, query_result). control은 daemon→app 방향이 없으므로 오버로드 불필요.
2. `daemon/src/chat-handler.ts` — ChatEvent 타입 import + send() 호출에 적용
3. `daemon/src/index.ts` — event_stream 전송 시 EventStreamPayload/AnyStreamEvent 타입 적용
4. `relay/src/routes/ws.ts` — protocol 타입 import, IncomingMessage/OutgoingMessage를 protocol 기반으로 강화
5. `app/src/core/relay/RelayClient.ts` — event_stream/query_result 수신 시 protocol 타입으로 typed handling
6. `daemon/tests/type-check.ts` 신규 — send() 오버로드 compile-fail fixture (@ts-expect-error 음수 테스트)
7. daemon query_result가 기존 E2E 암호화 규칙 적용 확인

## 2. 완료 조건
- [ ] daemon send()에 chat, event_stream, query_result 3종 오버로드 시그니처 존재
- [ ] daemon chat-handler.ts에서 ChatEvent import + 적용
- [ ] relay ws.ts에서 @wdk-app/protocol import 존재
- [ ] app RelayClient에서 EventStreamPayload, QueryResult 타입 기반 처리
- [ ] `packages/daemon/tests/type-check.ts` compile-fail fixture 존재 (@ts-expect-error 음수 케이스)
- [ ] daemon query_result 전송 시 encrypted 플래그 적용
- [ ] `npx tsc --noEmit -p packages/daemon` 통과
- [ ] `npx tsc --noEmit -p packages/relay` 통과
- [ ] `npx tsc --noEmit -p packages/app` 통과
- [ ] `npm test --workspace=packages/daemon` 통과

## 3. 롤백 방법
- git revert — 타입 annotation 추가/오버로드 추가이므로 revert 시 기존 loose 타입으로 복귀

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── relay-client.ts    # 수정 — send() 오버로드
├── chat-handler.ts    # 수정 — ChatEvent import + 적용
└── index.ts           # 수정 — AnyStreamEvent/EventStreamPayload 적용

packages/daemon/tests/
└── type-check.ts      # 신규 — compile-fail fixture

packages/relay/src/routes/
└── ws.ts              # 수정 — protocol 타입 import + 변환 레이어

packages/app/src/core/relay/
└── RelayClient.ts     # 수정 — typed event handling
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| relay-client.ts | send() 오버로드 | ✅ OK |
| chat-handler.ts | ChatEvent import | ✅ OK |
| daemon/index.ts | AnyStreamEvent 적용 | ✅ OK |
| type-check.ts | compile-fail fixture | ✅ OK |
| ws.ts | protocol 변환 레이어 | ✅ OK |
| RelayClient.ts | typed handling | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| daemon의 모든 send() 호출부 | 오버로드 적용 시 tsc가 불일치 발견 | ✅ OK — tsc로 커버 |

### 검증 통과: ✅

### Side Effect 위험
- send() 오버로드 추가 시 기존 리터럴 호출이 타입 불일치하면 컴파일 에러 → 수동으로 모든 호출부 확인 필요
- relay 타입 강화 시 내부 로직에 영향 줄 수 있음 → 변환 레이어로 격리

→ 완료
