# Step 02: authenticateWithRelay 단위 테스트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md + dod.md 기반)
- `packages/daemon/tests/relay-auth.test.ts` 신규 생성
- global `fetch` 모킹으로 3+2 시나리오 단위 테스트:
  1. **미등록 daemon** (F2): login 401 → register 201 → login 200 → token 반환
  2. **잘못된 secret** (F3): login 401 → register 409 → login 401 → throw
  3. **정상 daemon** (F4): login 200 → token 반환, register 미호출
  4. **동시 등록** (F5): login 401 → register 409 → login 200 → token 반환
  5. **에러 핸들링** (E1~E3):
     - register 500 → throw
     - login 500 → register 미호출 + throw
     - register 201 → login 재시도 500 → throw
- 로깅 검증:
  - register 201 → logger.info 호출 확인 (L1)
  - register 409 + login 재실패 → logger.error 호출 확인 (L2)
  - register 5xx → logger.error 호출 확인 (L3)

## 2. 완료 조건 ⚠️ 엄격하게 작성 필수
- [ ] F2 단위 테스트 통과 (미등록 daemon)
- [ ] F3 단위 테스트 통과 (잘못된 secret)
- [ ] F4 단위 테스트 통과 (정상 daemon, register 미호출 검증)
- [ ] F5 단위 테스트 통과 (동시 등록)
- [ ] E1 단위 테스트 통과 (register 5xx)
- [ ] E2 단위 테스트 통과 (login 비-401)
- [ ] E3 단위 테스트 통과 (login 재시도 실패)
- [ ] L1 로깅 검증 통과
- [ ] L2 로깅 검증 통과
- [ ] L3 로깅 검증 통과
- [ ] `npm test` 전체 통과 (기존 + 신규)

## 3. 롤백 방법
- `relay-auth.test.ts` 삭제
- 영향 범위: 테스트 파일만 — 프로덕션 코드 영향 없음

---

## Scope

### 신규 생성 파일
```
packages/daemon/tests/
└── relay-auth.test.ts  # 신규 - authenticateWithRelay 단위 테스트
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| relay-auth.ts | import 대상 | authenticateWithRelay 함수 테스트 |
| global fetch | 모킹 | 테스트 내 fetch 응답 모킹 |

### Side Effect 위험
- 없음 (테스트 파일 추가만)

### 참고할 기존 패턴
- `packages/daemon/tests/control-handler.test.ts`: daemon 기존 테스트 패턴 참조
- `packages/daemon/tests/message-queue.test.ts`: 모킹 패턴 참조

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| relay-auth.test.ts | 단위 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| F2~F5 시나리오 테스트 | ✅ relay-auth.test.ts | OK |
| E1~E3 에러 핸들링 | ✅ relay-auth.test.ts | OK |
| L1~L3 로깅 검증 | ✅ relay-auth.test.ts | OK |

### 검증 통과: ✅
