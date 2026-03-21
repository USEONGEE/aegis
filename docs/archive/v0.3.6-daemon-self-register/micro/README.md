# 작업 티켓 - v0.3.6

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | authenticateWithRelay 구현 + index.ts 통합 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | 단위 테스트 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| login 401 → self-register → login 재시도 자동화 | Step 01, 02 | ✅ |
| register 409 에러 없이 정상 진행 | Step 01, 02 | ✅ |
| 수동 개입 없이 자동 등록 | Step 01 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: relay-auth.ts에 함수 export (검증: 테스트에서 import 실행) | Step 01, 02 | ✅ |
| F2: 미등록 daemon 플로우 | Step 01, 02 | ✅ |
| F3: 잘못된 secret 플로우 | Step 01, 02 | ✅ |
| F4: 정상 daemon 플로우 | Step 01, 02 | ✅ |
| F5: 동시 등록 플로우 | Step 01, 02 | ✅ |
| F6: register 성공 로깅 | Step 01, 02 | ✅ |
| F7: wrong secret 에러 로깅 | Step 01, 02 | ✅ |
| N1: tsc 통과 | Step 01 | ✅ |
| N2: 기존 테스트 통과 | Step 02 | ✅ |
| N3: build 통과 | Step 01 | ✅ |
| N4: index.ts 통합 구조 검증 | Step 01 | ✅ |
| E1: register 5xx | Step 01, 02 | ✅ |
| E2: login 비-401 | Step 01, 02 | ✅ |
| E3: login 재시도 실패 | Step 01, 02 | ✅ |
| L1~L3: 필수 로그 | Step 01, 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| authenticateWithRelay() 별도 모듈(`relay-auth.ts`) 분리 | Step 01 | ✅ |
| login 401 → register → login 재시도 전략 | Step 01, 02 | ✅ |
| 기존 `fetch()` 패턴 유지 (node built-in) | Step 01 | ✅ |
| register 응답 body 미사용 | Step 01 | ✅ |
| 반환값: JWT token string | Step 01, 02 | ✅ |
| fetch 모킹 단위 테스트 | Step 02 | ✅ |
| 로깅 설계 (필수/권장 분리) | Step 01, 02 | ✅ |

## Step 상세
- [Step 01: authenticateWithRelay 구현 + index.ts 통합](step-01-relay-auth.md)
- [Step 02: 단위 테스트](step-02-unit-test.md)
