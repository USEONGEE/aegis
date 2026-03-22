# DoD (Definition of Done) - v0.5.14

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | Activity 탭 진입 시 기존 이벤트 타임라인 대신 정책 뷰가 표시됨 | 수동 테스트: Activity 탭 진입 |
| F2 | 현재 선택된 accountIndex의 지갑 주소가 상단에 표시됨 | 수동 테스트: 주소 확인 |
| F3 | `relay.query('policyList', {accountIndex, chainId: 999})`로 활성 정책 목록 조회 + 표시 | 코드 리뷰 + 수동 테스트 |
| F4 | `relay.query('pendingApprovals', {accountIndex})`로 대기 정책 목록 조회, `type === 'policy'`만 필터하여 표시 | 코드 리뷰 + 수동 테스트 |
| F5 | 로딩 중 스피너 표시 | 수동 테스트 |
| F6 | 조회 실패 시 에러 메시지 + 재시도 버튼 표시 ("정책 없음"과 구분) | 수동 테스트: Relay 끊긴 상태에서 진입 |
| F7 | 정책 없을 때 "등록된 정책이 없습니다" 표시 | 수동 테스트 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 이번 변경으로 새 tsc 에러 추가 없음 (baseline 대비 악화 없음) | 변경 전/후 `npx tsc --noEmit -p packages/app/tsconfig.json 2>&1 \| grep -c "error TS"` diff 비교 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | mount 시 refetch | Activity 탭 진입하면 정책 조회 실행 | 수동 테스트 |
| E2 | accountIndex 변경 시 refetch | 다른 지갑 선택 → 정책 재조회 | 수동 테스트 |
| E3 | Relay 재연결 시 refetch | 연결 복구 → 자동 재조회 | 수동 테스트 |
| E4 | Relay 끊긴 상태에서 Activity 진입 | 에러 상태 표시 (빈 상태와 구분) | 수동 테스트 |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 이벤트 타임라인 제거 → 정책 뷰 | F1 | ✅ |
| accountIndex 기준 주소 표시 | F2 | ✅ |
| 활성 정책 + 대기 정책 표시 | F3, F4 | ✅ |
| 조회 실패와 정책 없음 구분 | F6, F7 | ✅ |
| refetch triggers | E1, E2, E3 | ✅ |
