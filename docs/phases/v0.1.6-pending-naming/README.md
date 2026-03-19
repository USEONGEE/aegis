# PendingRequest 이름 정리 - v0.1.6

## 문제 정의

### 현상
- v0.1.4에서 `PendingRequest`를 `PendingApprovalRequest` + `PendingRequest`로 분리했으나, `PendingRequest`라는 이름이 여전히 모호
- "무엇이 pending인가?"가 이름만으로 구분되지 않음 — 승인 대기인지 메시지 응답 대기인지 알 수 없음
- 두 타입 간 공통 필드(`requestId`, `seedId`, `chainId`, `createdAt`)가 중복 정의되어 있음

### 원인
- v0.1.4 타입 분리 시 `PendingApprovalRequest`는 명확히 명명했으나, 나머지를 `PendingRequest`라는 범용 이름으로 남겨둠
- 공통 필드에 대한 추상화 없이 각 타입이 독립적으로 동일 필드를 선언

### 영향
- 코드 리뷰 시 `PendingRequest`가 어떤 pending인지 컨텍스트 없이 파악 불가
- store에서 "모든 pending 조회" 또는 "pending 취소"를 타입-무관하게 처리하는 공통 인터페이스 부재
- 향후 새로운 pending 타입(예: PendingPolicyRequest) 추가 시 공통 구조가 없어 중복 증가

### 목표
- `PendingRequest` → `PendingMessageRequest`로 이름 변경하여 용도 명확화
- `PendingBase` 공통 인터페이스 도입하여 공통 필드 추상화
- 공통 인터페이스를 통한 타입-무관 연산(조회, 취소) 지원 기반 마련

### 비목표 (Out of Scope)
- store 구현 변경 (메서드 로직, 스토리지 방식)
- 새로운 pending 타입 추가
- cancel API 통합 구현 (기반만 마련, 실제 구현은 별도 Phase)
- 동작 변경 — 순수 이름 변경 + 타입 추출 리팩토링

## 제약사항
- 기존 테스트 268개 전체 통과 유지
- CI 7/7 PASS 유지
- breaking change 허용 (CLAUDE.md 핵심 원칙 #4)
