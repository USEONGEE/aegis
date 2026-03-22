# Step 07: 테스트 + 검증

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 06

---

## 1. 구현 내용 (design.md 기반)
- `guarded-wdk/tests/approval-broker.test.ts` 업데이트: 새 submitApproval 시그니처 + 원자적 emit 테스트
- `daemon/tests/control-handler.test.ts` 업데이트: savePolicy/setTrustedApprovers 직접 호출 assertion 제거
- `daemon/tests/event-stream-wire.test.ts` 신규: EventStreamEvent wire shape 회귀 테스트
- 전체 CI 체크 실행
- CLAUDE.md에 app 후속 Phase (ControlResult→WDK 이벤트 전환) 기록

## 2. 완료 조건
- [ ] approval-broker.test.ts: 성공 시 ApprovalVerified + 도메인이벤트 순서 확인 테스트
- [ ] approval-broker.test.ts: 실패 시 ApprovalFailed만 emit, 성공 이벤트 없음 테스트
- [ ] approval-broker.test.ts: appendHistory 실패 시 ApprovalFailed emit 테스트
- [ ] approval-broker.test.ts: 리스너 예외 시 submitApproval 정상 완료 테스트
- [ ] approval-broker.test.ts: policy_approval 시 savePolicy 호출 확인 테스트
- [ ] approval-broker.test.ts: device_revoke 시 setTrustedApprovers 호출 확인 테스트
- [ ] control-handler.test.ts: 승인 6종에서 store 직접 호출 없음 확인
- [ ] control-handler.test.ts: 승인 6종 반환값 null 확인
- [ ] control-handler.test.ts: cancel 2종 반환값 ControlResult 확인
- [ ] event-stream-wire.test.ts: `{ type: 'event_stream', event: { type: '...', timestamp, ... } }` 형태 확인
- [ ] event-stream-wire.test.ts: eventName 필드 없음 확인
- [ ] `npx jest --config packages/daemon/jest.config.js` 전체 통과
- [ ] `npx jest --config packages/guarded-wdk/jest.config.js` 전체 통과
- [ ] `npx tsx scripts/check/index.ts` CI 체크 통과
- [ ] CLAUDE.md에 app 후속 Phase (ControlResult→WDK 이벤트 전환) 기록

## 3. 롤백 방법
- git revert (테스트 파일 + CLAUDE.md 변경)

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/tests/
└── approval-broker.test.ts     # 수정 — 새 시그니처 + 원자적 emit 테스트

packages/daemon/tests/
└── control-handler.test.ts     # 수정 — store 직접 호출 assertion 제거

CLAUDE.md                       # 수정 — app 후속 Phase 기록 (NF4)
```

### 신규 생성 파일
```
packages/daemon/tests/
└── event-stream-wire.test.ts   # 신규 — EventStreamEvent wire shape 회귀 테스트
```

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 완료: CI 체크 + jest 전체 통과 확인
