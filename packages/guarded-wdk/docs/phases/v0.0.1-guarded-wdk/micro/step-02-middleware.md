# Step 02: guarded-middleware.js

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: Step 01 (errors.js, approval-broker.js)

---

## 1. 구현 내용 (design.md 기반)

### createGuardedMiddleware 함수
WDK registerMiddleware에 넘길 async (account) => { } 형태의 middleware.

#### 차단 (ForbiddenError)
- `account.sign` → throw
- `account.signTypedData` → throw
- `account.dispose` → throw
- `account.keyPair` → getter 재정의 → throw

#### sendTransaction guard
- tx의 calldata 파싱: `tx.to` (target), `tx.data.slice(0, 10)` (selector), args 디코딩
- `evaluatePolicy(policies, chain, tx)` 순수 함수 inline
  - timestamp gate 평가
  - call permissions 순서 매칭 (target + selector + args 조건)
  - 조건 연산자 8종: EQ, NEQ, GT, GTE, LT, LTE, ONE_OF, NOT_ONE_OF
  - 매치 없으면 기본 REJECT
- decision별 처리:
  - AUTO → rawSendTransaction 실행
  - REQUIRE_APPROVAL → ApprovalBroker 대기 → 승인 후 실행
  - REJECT → throw PolicyRejectionError
- 이벤트 emit: IntentProposed, PolicyEvaluated, ExecutionBroadcasted
- settlement polling: `pollReceipt()` inline helper (fire-and-forget)

#### transfer guard
- transfer options를 tx 등가로 변환 후 동일 policy 평가

#### matchArgs helper
- calldata에서 인자 인덱스별 값 추출 (offset = index * 32)
- 조건 연산자별 비교 로직

#### policy validation
- malformed policy 입력 시 즉시 에러 throw (No Fallback)

## 2. 완료 조건
- [ ] `src/guarded/guarded-middleware.js` 생성
- [ ] createGuardedMiddleware() export
- [ ] sign() 호출 시 ForbiddenError (F11)
- [ ] signTypedData() 호출 시 ForbiddenError (F12)
- [ ] keyPair 접근 시 ForbiddenError (F13)
- [ ] dispose() 호출 시 ForbiddenError (F14)
- [ ] sendTransaction이 calldata 파싱 후 policy 평가 (F3)
- [ ] transfer가 policy 평가를 거침 (F4)
- [ ] call permission 순서 매칭, 기본 REJECT (F5)
- [ ] timestamp gate 동작 (F6)
- [ ] 조건 연산자 8종 정상 동작 (F7)
- [ ] REQUIRE_APPROVAL 시 ApprovalBroker 대기 후 실행 (F8)
- [ ] REJECT 시 PolicyRejectionError throw
- [ ] approve() 호출이 차단되지 않고 sendTransaction을 통해 policy 평가 (F15)
- [ ] 이벤트 emit 순서 정확 (F17)
- [ ] 실패 시 ExecutionFailed 이벤트 (F18)
- [ ] settlement polling → ExecutionSettled 이벤트 (F21)
- [ ] malformed policy 시 validation error (E10)
- [ ] tx.data 4바이트 미만 시 REJECT (E3)
- [ ] tx.to 없으면 REJECT (E4)
- [ ] 빈 permissions → 모든 tx REJECT (E1)
- [ ] chain에 해당하는 policy 없음 → REJECT (E2)
- [ ] 린트 통과
- [ ] 테스트 통과

## 3. 롤백 방법
- `rm src/guarded/guarded-middleware.js`

---

## Scope

### 신규 생성 파일
```
src/guarded/
└── guarded-middleware.js   # 신규 — 핵심 middleware

tests/guarded/
├── evaluate-policy.test.js  # 신규 — evaluatePolicy unit test
├── match-args.test.js       # 신규 — matchArgs unit test
└── middleware.test.js       # 신규 — middleware integration test
```

### 수정 대상 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| errors.js | import | ForbiddenError, PolicyRejectionError |
| approval-broker.js | 인자로 주입 | request, waitForApproval, consume |
| node:crypto | import | randomUUID |

### Side Effect 위험
없음 (신규 파일, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-middleware.js | F3-F7, F11-F18, F21, E1-E4, E10 | ✅ OK |
| evaluate-policy.test.js | F5-F7, E1-E4 | ✅ OK |
| match-args.test.js | F7 | ✅ OK |
| middleware.test.js | F3, F4, F11-F18 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| evaluatePolicy | ✅ | OK |
| matchArgs | ✅ | OK |
| pollReceipt | ✅ (middleware 내 inline) | OK |
| policy validation | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: guarded-wdk-factory.js + index.js](step-03-factory.md)
