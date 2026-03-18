# Step 01: errors.js + approval-broker.js

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

### errors.js
- `ForbiddenError` — sign/signTypedData/keyPair/dispose 호출 시
- `PolicyRejectionError` — policy REJECT 시
- `ApprovalTimeoutError` — 승인 대기 timeout 시

### approval-broker.js
- `InMemoryApprovalBroker` 클래스
  - `request(req)` → ticket 생성, pending store에 저장
  - `grant(ticketId, artifact)` → owner가 승인
  - `waitForApproval(ticketId, timeoutMs)` → polling 대기, timeout 시 ApprovalTimeoutError
  - `consume(ticketId)` → 1회성 삭제

## 2. 완료 조건
- [ ] `src/guarded/errors.js` 생성, 3개 에러 클래스 export
- [ ] `src/guarded/approval-broker.js` 생성, InMemoryApprovalBroker export
- [ ] request() 호출 시 ticket 반환
- [ ] grant() 후 waitForApproval()이 artifact 반환
- [ ] consume() 후 동일 ticketId로 다시 consume 시 실패
- [ ] waitForApproval timeout 시 ApprovalTimeoutError throw
- [ ] 린트 통과: `npx standard src/guarded/errors.js src/guarded/approval-broker.js`
- [ ] 테스트 통과: `npm test -- --testPathPattern=approval-broker`

## 3. 롤백 방법
- `rm src/guarded/errors.js src/guarded/approval-broker.js`

---

## Scope

### 신규 생성 파일
```
src/guarded/
├── errors.js           # 신규 — 에러 3종
└── approval-broker.js  # 신규 — InMemoryApprovalBroker

tests/guarded/
└── approval-broker.test.js  # 신규 — unit test
```

### 수정 대상 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| errors.js | 자체 | 의존성 없음 |
| approval-broker.js | errors.js 사용 | ApprovalTimeoutError import |

### Side Effect 위험
없음 (독립 모듈, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| errors.js | F11-F14, 에러 처리 전체 | ✅ OK |
| approval-broker.js | F8-F10 | ✅ OK |
| approval-broker.test.js | F8-F10 검증 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 에러 3종 | ✅ errors.js | OK |
| InMemoryApprovalBroker | ✅ approval-broker.js | OK |
| 테스트 | ✅ test 파일 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: guarded-middleware.js](step-02-middleware.md)
