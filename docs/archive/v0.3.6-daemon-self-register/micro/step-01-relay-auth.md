# Step 01: authenticateWithRelay 함수 구현 + index.ts 통합

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `packages/daemon/src/relay-auth.ts` 신규 생성
- `authenticateWithRelay(relayHttpBase, daemonId, daemonSecret, logger)` 함수 구현
  - login 200 → token 반환
  - login 401 → register 시도 → login 재시도
  - register 201 (등록 성공), 409 (이미 등록) 처리
  - register 5xx / login 비-401 에러 → throw
- 설계의 로깅 계약 반영 (필수 로그 L1~L3 + 권장 intermediate 로그)
- `packages/daemon/src/index.ts` 수정: 기존 인라인 auth 로직을 `authenticateWithRelay()` 호출로 교체

## 2. 완료 조건 ⚠️ 엄격하게 작성 필수
- [ ] `relay-auth.ts`에 `authenticateWithRelay` 함수가 export됨 (F1)
- [ ] `index.ts`에서 `authenticateWithRelay()`를 호출하여 token 획득, enrollment/WS 연결에 사용 (N4)
- [ ] `npx tsc --noEmit` 통과 (N1)
- [ ] `npm run build` 통과 (N3)
- [ ] 기존 daemon 테스트 통과 (N2)

## 3. 롤백 방법
- `relay-auth.ts` 삭제 + `index.ts`의 import/호출 제거 → 기존 인라인 코드 복원
- 영향 범위: daemon bootstrap auth 부분만

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── index.ts      # 수정 - 인라인 auth 로직을 authenticateWithRelay() 호출로 교체
```

### 신규 생성 파일
```
packages/daemon/src/
└── relay-auth.ts  # 신규 - authenticateWithRelay() 함수 정의
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| index.ts | 직접 수정 | auth 로직을 helper 호출로 교체 |
| relay-auth.ts | 신규 생성 | 순수 함수, 외부 의존 없음 (fetch + logger) |

### Side Effect 위험
- index.ts의 enrollment/WS 연결 코드는 변경하지 않음 → side effect 없음
- legacy fallback 경로(`relayToken` 직접 사용)는 변경하지 않음

### 참고할 기존 패턴
- `packages/daemon/src/index.ts:144-152`: 현재 fetch + 상태 코드 분기 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| index.ts | auth 로직 교체 | ✅ OK |
| relay-auth.ts | 함수 정의 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| authenticateWithRelay 함수 구현 | ✅ relay-auth.ts | OK |
| index.ts에서 호출 교체 | ✅ index.ts | OK |
| 로깅 구현 | ✅ relay-auth.ts 내부 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: 단위 테스트](step-02-unit-test.md)
