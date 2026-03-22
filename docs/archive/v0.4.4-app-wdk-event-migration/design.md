# 설계 - v0.4.4

## 변경 규모
**규모**: 작은 변경
**근거**: 단일 패키지(app) 내 3~4 파일 수정, 기존 패턴 유지, 내부 API 시그니처 미변경

---

## 문제 요약
v0.4.2 이후 app의 승인 플로우가 완전히 깨짐. sendApproval() 타임아웃, eventName 참조 실패.

> 상세: [README.md](README.md) 참조

## 접근법

**최소 변경으로 호환성 복원**:
1. sendApproval() — ControlResult 대기 → WDK event_stream 대기로 전환 (반환값 유지)
2. eventName → event.type — 2개 화면에서 필드명만 마이그레이션
3. RootNavigator에서 activity store에 이벤트 기록 추가

## 대안 검토

### 이벤트 소비 아키텍처

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 화면별 listener 유지 + event.type 수정 | 변경 최소. balances/positions 로컬 state 그대로 | 이벤트 소비 분산 | ✅ |
| B: RootNavigator 중앙 소비 → store → 화면 구독 | 이벤트 소비 1곳 | Dashboard balances/positions를 새 store로 이동해야 함. 과도 | ❌ |

**선택 이유**: A — Dashboard의 balances/positions는 WDK 이벤트에서 직접 추출하는 화면 로컬 상태. 이걸 store로 옮기면 별도 Phase 규모. 이번은 v0.4.2 호환성 복원에 집중.

### sendApproval() 반환값

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `{ txHash }` 유지 (non-tx는 빈 문자열) | TxApprovalContext + ApprovalScreen 변경 없음 | 빈 문자열이 의미론적으로 깔끔하지 않음 | ✅ |
| B: `{ ok: boolean }` 변경 | 깔끔 | TxApprovalContext, ApprovalScreen, AppProviders 전부 수정 필요 | ❌ |

**선택 이유**: A — 호환성 복원 목적에 맞게 기존 인터페이스 유지. txHash 의미론 개선은 후속.

## 기술 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| sendApproval 이벤트 수신 | RelayClient 내부 event_stream 필터링 (requestId 매칭) | 자기완결 |
| sendApproval 반환값 | `{ txHash }` 유지 | TxApprovalContext 변경 최소화 |
| 화면별 listener | 유지 (eventName → event.type 수정만) | balances/positions 로컬 state 보존 |
| activity store | RootNavigator syncHandler에서 event_stream → addEvent | 이벤트 이력 자동 기록 |
| ActivityEventType | ApprovalFailed 추가 | 실패도 활동 이력 |

## 테스트 전략

| 레벨 | 범위 | 방법 |
|------|------|------|
| Manual | 승인 6종 플로우 | 앱에서 승인 → 타임아웃 없이 성공/실패 확인 |
| tsc | 타입 안전 | `tsc --noEmit` 통과 |
