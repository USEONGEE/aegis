# Step 07: WDK 이벤트 relay (Gap 5+14)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `wdk-host.ts`: broker 생성 시 emitter 전달
- `index.ts`: 12종 이벤트명 배열로 루프 등록
- 지원 이벤트:
  ```
  IntentProposed, PolicyEvaluated, ApprovalRequested, ApprovalGranted,
  ExecutionBroadcasted, ExecutionSettled, ExecutionFailed,
  PendingPolicyRequested, ApprovalVerified, ApprovalRejected, PolicyApplied, DeviceRevoked
  ```
- 각 이벤트 발생 시 `relay.send('control', { type: 'event_stream', eventName, event })` 호출
- primitive 방식: 별도 프로토콜 없이 이벤트 그대로 forward

## 2. 완료 조건
- [ ] `RELAY_EVENTS` 배열에 12종 이벤트명 존재
- [ ] `wdk.on(eventName, ...)` 루프 등록 코드 존재
- [ ] `relay.send('control', { type: 'event_stream', ... })` 호출 존재
- [ ] wdk-host에 emitter 전달 코드 존재
- [ ] 이벤트 forward 테스트 통과 (mock emitter → relay.send 호출 검증)
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon 패키지만 (wdk-host + index)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── wdk-host.ts                 # broker 생성 시 emitter 전달
└── index.ts                    # RELAY_EVENTS 배열 + 루프 등록
```

### Side Effect 위험
- 이벤트가 relay로 전송되므로 app이 수신 처리해야 함 (Step 09에서 처리)

## FP/FN 검증

### 검증 통과: ✅
- guarded-wdk의 emitter는 이미 구현되어 있으므로 수정 불필요 (OK)
- relay는 투명 전달 (OK)

---

> 다음: [Step 08: stored policy restore](step-08-policy-restore.md)
