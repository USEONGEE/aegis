# Step 06: approval ack (Gap 4+22)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 04

---

## 1. 구현 내용 (design.md 기반)
- `control-handler.ts`: handleControlMessage 반환값을 relay로 전송
- policy_approval 처리 후: `{ type: 'approval_result', requestId, ok: true }` 전송
- device_revoke 처리 후: `{ type: 'approval_result', requestId, ok: true }` 전송
- `index.ts`: control-handler 반환값을 relay.send로 연결
- app이 결과를 수신하여 UI 업데이트 가능하게 됨

## 2. 완료 조건
- [ ] control-handler가 policy_approval 처리 후 결과 객체 반환
- [ ] control-handler가 device_revoke 처리 후 결과 객체 반환
- [ ] index.ts에서 반환값을 `relay.send('control', result)` 호출
- [ ] control-handler.test.ts: approval_result 반환 테스트 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon 패키지만 (control-handler + index)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── control-handler.ts          # handleControlMessage 반환값 추가
└── index.ts                    # 반환값을 relay.send로 연결
```

### Side Effect 위험
- 없음 (기존 흐름에 결과 전송만 추가)

## FP/FN 검증

### 검증 통과: ✅
- relay는 투명 전달이므로 수정 불필요 (OK)
- app은 메시지 수신 시 type으로 분기하므로 별도 수정은 Step 09에서 처리 (OK)

---

> 다음: [Step 07: WDK 이벤트 relay](step-07-event-relay.md)
