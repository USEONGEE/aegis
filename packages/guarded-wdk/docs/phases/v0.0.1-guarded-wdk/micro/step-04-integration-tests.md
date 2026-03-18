# Step 04: Integration Tests + DoD 최종 검증

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (테스트 파일 삭제)
- **선행 조건**: Step 01, 02, 03

---

## 1. 구현 내용 (dod.md 기반)

### end-to-end integration tests
- mock WDK account + mock provider로 전체 흐름 테스트
- DoD의 모든 integration test 시나리오 커버

### 테스트 시나리오
1. Aave repay AUTO: policy 매칭 → 즉시 실행 → event emit 순서
2. Aave repay REQUIRE_APPROVAL: policy → 승인 대기 → grant → 실행
3. 미허용 sendTransaction: 매칭 없음 → PolicyRejectionError
4. approve to known spender + bounded amount: policy 통과
5. approve to unknown spender: REJECT
6. sign() 차단: ForbiddenError
7. settlement: pollReceipt → ExecutionSettled event
8. updatePolicies snapshot: old/new snapshot 분리
9. 동시 실행 (Promise.all): 서로 독립적 policy 평가
10. protocol 자동 guard: mock protocol → sendTransaction → policy 평가
11. REQUIRE_APPROVAL 대기 중 두 번째 요청: 각각 독립 승인 대기 (E7)
12. USDT approve 기존 allowance > 0 → 에러 (E9, mock)

### DoD 최종 검증
- F1-F23, N1-N5, E1-E10 전체 통과 확인
- 린트 전체 통과
- 기존 코드 수정 없음 확인

## 2. 완료 조건
- [ ] `tests/guarded/integration.test.js` 생성
- [ ] 10개 시나리오 전부 테스트 통과
- [ ] `npm test` 전체 통과 (N2)
- [ ] `npx standard src/guarded/` 린트 통과 (N1)
- [ ] `git diff -- ':!src/guarded' ':!docs' ':!tests' ':!CLAUDE.md' ':!package.json' ':!package-lock.json'` 결과 없음 (N3)
- [ ] `ls src/guarded/` 결과 5개 파일만 (N4)
- [ ] Bare 미지원 모듈 없음 확인 (N5)
- [ ] DoD의 F1-F23, N1-N5, E1-E10 전항목 통과

## 3. 롤백 방법
- `rm tests/guarded/integration.test.js`

---

## Scope

### 신규 생성 파일
```
tests/guarded/
└── integration.test.js    # 신규 — e2e integration test
```

### 수정 대상 파일
없음 (이전 Step의 코드에 버그 발견 시 해당 파일 수정 가능)

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| src/guarded/* | import (테스트 대상) | 전체 모듈 |
| jest | devDependency | 테스트 프레임워크 |

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| integration.test.js | DoD F1-F23, E1-E10 검증 | ✅ OK |

### False Negative (누락)
없음

### 검증 통과: ✅
