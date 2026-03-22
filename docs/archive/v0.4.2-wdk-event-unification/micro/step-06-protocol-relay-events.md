# Step 06: Protocol + RELAY_EVENTS 업데이트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 05

---

## 1. 구현 내용 (design.md 기반)
- `protocol/src/control.ts`의 `EventStreamEvent`에서 `eventName` 필드 제거
- `event` 필드 타입을 `unknown` → `AnyWDKEvent`로 변경
- `daemon/src/index.ts`의 RELAY_EVENTS에 `'ApprovalFailed'` 추가 (13→14종)
- daemon event relay 코드에서 `eventName` 제거: `{ type: 'event_stream', event }` 형태로 변경

## 2. 완료 조건
- [ ] `EventStreamEvent`에 `eventName` 필드 없음
- [ ] `EventStreamEvent.event` 타입이 `AnyWDKEvent`
- [ ] RELAY_EVENTS 배열에 `'ApprovalFailed'` 포함 (14종)
- [ ] daemon event relay가 `{ type: 'event_stream', event }` 형태로 전송 (eventName 없음)
- [ ] `tsc --noEmit` 통과 (protocol, daemon)

## 3. 롤백 방법
- git revert (wire protocol 변경이므로 반드시 daemon+protocol 동시 revert)

---

## Scope

### 수정 대상 파일
```
packages/protocol/src/
└── control.ts         # 수정 — EventStreamEvent.eventName 제거, event 타입 변경

packages/daemon/src/
└── index.ts           # 수정 — RELAY_EVENTS에 ApprovalFailed 추가, eventName 제거
```

### Side Effect 위험
- app이 EventStreamEvent를 소비하는 코드가 있으면 eventName 참조가 깨짐
  → 비범위(app 별도 Phase)이므로 이 Step에서는 protocol+daemon만 수정

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 07: 테스트 + 검증](step-07-tests-verify.md)
