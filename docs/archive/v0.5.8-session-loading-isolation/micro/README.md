# 작업 티켓 - v0.5.8

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | Store 인터페이스 전환 | 🟡 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-23 |
| 02 | ChatDetailScreen 소비자 전환 | 🟠 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-23 |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 4개 transient 상태를 세션별 독립 관리 | Step 01 | ✅ |
| 각 세션 독립적 전송/대기/취소 | Step 01, 02 | ✅ |
| 동일 세션 내 단일 in-flight 유지 | Step 02 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: ChatState top-level에서 4개 글로벌 필드 제거 + sessionTransient 존재 | Step 01 | ✅ |
| F2: getSessionTransient fallback | Step 01 | ✅ |
| F3: setSessionTransient 해당 세션만 업데이트 | Step 01 | ✅ |
| F4: resetSessionTransient 해당 세션만 초기화 | Step 01 | ✅ |
| F5: ChatDetailScreen 읽기가 currentSessionId 기준 | Step 02 | ✅ |
| F6: ChatDetailScreen 쓰기가 sessionId 키 사용 | Step 02 | ✅ |
| F7: CancelCompleted/CancelFailed return만 | Step 02 | ✅ |
| F8: 동일 세션 단일 in-flight (cancel/send 전환) | Step 02 | ✅ |
| N1: tsc 에러 baseline 악화 없음 | Step 01, 02 | ✅ |
| N2: sessionTransient persist 미포함 | Step 01 | ✅ |
| N3: 기존 4개 setter 완전 제거 | Step 01 | ✅ |
| E1: 세션 A 로딩 중 세션 B 전송 가능 | Step 02 | ✅ |
| E2: 세션 A 로딩 중 B 전송 후 A 복귀 시 A 로딩 유지 | Step 02 | ✅ |
| E3: 미등록 세션 ID → DEFAULT 반환 | Step 01 | ✅ |
| E4: 세션 A 취소 후 B 스트림 보호 | Step 02 | ✅ |
| E5: MAX_SESSIONS 트림 시 sessionTransient cleanup | Step 01 | ✅ |
| E6: 앱 재시작 후 idle 복원 | Step 01 (persist 제외), Step 02 (통합 검증) | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| TD-1: SessionTransientState 타입 | Step 01 | ✅ |
| TD-2: Store 인터페이스 변경 | Step 01 | ✅ |
| TD-3: Getter fallback | Step 01 | ✅ |
| TD-4: Persist 제외 | Step 01 | ✅ |
| TD-5: ChatDetailScreen 소비 패턴 | Step 02 | ✅ |
| TD-6: 세션 트림 cleanup | Step 01 | ✅ |
| TD-7: CancelCompleted/CancelFailed no-op | Step 02 | ✅ |

## Step 상세
- [Step 01: Store 인터페이스 전환](step-01-store-interface.md)
- [Step 02: ChatDetailScreen 소비자 전환](step-02-consumer-migration.md)
