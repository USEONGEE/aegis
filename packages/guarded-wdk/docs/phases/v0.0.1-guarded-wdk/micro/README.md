# 작업 티켓 - v0.0.1

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | errors.js + approval-broker.js | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | guarded-middleware.js | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | guarded-wdk-factory.js + index.js | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | Integration Tests + DoD 검증 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02 → 03 → 04
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| GuardedAccount 제공, AI는 이 인터페이스만 사용 | Step 03 (F1, F2, F22, F23) | ✅ |
| 모든 intent는 policy engine을 거침 | Step 02 (F3-F7) | ✅ |
| REQUIRE_APPROVAL 시 owner 1회성 승인 | Step 01 (F8-F10), Step 02 | ✅ |
| 모든 실행은 구조화된 이벤트로 보고 | Step 02 (F17, F18, F21) | ✅ |
| 기존 WDK 모듈 수정 없이 decorator + middleware | Step 04 (N3, N4) | ✅ |
| sign/signTypedData/keyPair 차단 | Step 02 (F11-F14) | ✅ |
| approve는 policy가 검증 | Step 02 (F15) | ✅ |
| protocol 호출도 자동 guard | Step 04 (F16) | ✅ |
| 런타임 policy 교체 | Step 03 (F19, F20) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 (facade 반환) | Step 03 | ✅ |
| F2 (instanceof 통과) | Step 03 | ✅ |
| F3 (sendTransaction policy) | Step 02 | ✅ |
| F4 (transfer policy) | Step 02 | ✅ |
| F5 (순서 매칭, 기본 REJECT) | Step 02 | ✅ |
| F6 (timestamp gate) | Step 02 | ✅ |
| F7 (조건 연산자 8종) | Step 02 | ✅ |
| F8 (REQUIRE_APPROVAL 흐름) | Step 01 + 02 | ✅ |
| F9 (1회성 consume) | Step 01 | ✅ |
| F10 (approval timeout) | Step 01 | ✅ |
| F11-F14 (차단) | Step 02 | ✅ |
| F15 (approve policy) | Step 02 + 04 | ✅ |
| F16 (protocol 자동 guard) | Step 04 | ✅ |
| F17 (이벤트 순서) | Step 02 + 04 | ✅ |
| F18 (ExecutionFailed) | Step 02 | ✅ |
| F19 (updatePolicies) | Step 03 | ✅ |
| F20 (immutable snapshot) | Step 03 | ✅ |
| F21 (settlement) | Step 02 + 04 | ✅ |
| F22 (raw account 은닉) | Step 03 | ✅ |
| F23 (Object.freeze) | Step 03 | ✅ |
| N1 (린트) | Step 04 | ✅ |
| N2 (테스트) | Step 04 | ✅ |
| N3 (기존 코드 무수정) | Step 04 | ✅ |
| N4 (5파일) | Step 04 | ✅ |
| N5 (Bare 호환) | Step 04 | ✅ |
| E1-E4 (엣지케이스) | Step 02 | ✅ |
| E5-E9 (엣지케이스) | Step 04 | ✅ |
| E10 (malformed policy) | Step 02 + 03 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| Contract level policy | Step 02 | ✅ |
| Timestamp gate | Step 02 | ✅ |
| approve() 차단 안 함, policy 검증 | Step 02 | ✅ |
| Protocol wrapping 없음 | Step 04 (검증) | ✅ |
| Node.js EventEmitter 내장 | Step 03 | ✅ |
| Object.freeze | Step 03 | ✅ |
| Immutable snapshot 교체 | Step 03 | ✅ |
| 5파일 구조 | Step 04 (N4) | ✅ |
| Node.js + Bare 지원 | Step 04 (N5) | ✅ |
| No Fallback (malformed policy) | Step 02 (E10) | ✅ |

## Step 상세
- [Step 01: errors.js + approval-broker.js](step-01-errors-and-broker.md)
- [Step 02: guarded-middleware.js](step-02-middleware.md)
- [Step 03: guarded-wdk-factory.js + index.js](step-03-factory.md)
- [Step 04: Integration Tests + DoD 검증](step-04-integration-tests.md)
