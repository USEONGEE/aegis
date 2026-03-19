# Step 17: ApprovalRejected 이벤트 (Gap 15)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `signed-approval-broker.ts`: policy_reject case에 이벤트 emit 추가
- emit 코드:
  ```typescript
  if (this._emitter) {
    this._emitter.emit('ApprovalRejected', { type: 'ApprovalRejected', requestId, timestamp: Date.now() })
  }
  ```
- Step 07에서 등록한 RELAY_EVENTS에 이미 'ApprovalRejected' 포함

## 2. 완료 조건
- [ ] `signed-approval-broker.ts`의 policy_reject 분기에 `emit('ApprovalRejected', ...)` 존재
- [ ] emit되는 객체에 `type`, `requestId`, `timestamp` 필드 존재
- [ ] approval-broker.test.ts: policy_reject 시 ApprovalRejected 이벤트 emit 테스트 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: guarded-wdk 패키지만

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── signed-approval-broker.ts   # policy_reject에 ApprovalRejected emit 추가

packages/guarded-wdk/tests/
└── approval-broker.test.ts     # ApprovalRejected emit 테스트 추가
```

### Side Effect 위험
- 없음 (이벤트 추가만, 기존 로직 변경 없음)

## FP/FN 검증

### 검증 통과: ✅
- Step 07에서 RELAY_EVENTS에 'ApprovalRejected'가 포함되어 있어 자동 relay (OK)

---

> 다음: [Step 18: ChainPolicies → store 캐시 통합](step-18-chain-policies-integration.md)
