# DoD (Definition of Done) - v0.5.10

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | protocol에 `getWalletAddress` query 타입이 정의됨 | `grep 'getWalletAddress' packages/protocol/src/query.ts` |
| F2 | daemon query-handler가 `getWalletAddress` query를 처리하여 주소를 반환함 | `grep 'getWalletAddress' packages/daemon/src/query-handler.ts` |
| F3 | App에 `useWalletStore`가 존재하고 현재 선택된 accountIndex를 추적함 | `ls packages/app/src/stores/useWalletStore.ts` |
| F4 | Wallet 탭 상단에 현재 지갑의 주소가 축약 형태(0x1234...abcd)로 표시됨 | 수동: Wallet 탭 진입 시 주소 표시 확인 |
| F5 | 주소를 탭하면 클립보드에 전체 주소가 복사됨 | 수동: 주소 탭 후 붙여넣기 확인 |
| F6 | 지갑 목록이 표시되고 다른 지갑을 선택하면 주소와 포트폴리오가 해당 지갑으로 전환됨 | 수동: 지갑 2개 이상에서 전환 테스트 |
| F7 | 새 지갑 추가 버튼으로 지갑을 생성할 수 있음 | 수동: 추가 후 목록에 새 지갑 표시 확인 |
| F8 | 기존 지갑을 삭제할 수 있음 (마지막 1개는 삭제 불가) | 수동: 삭제 후 목록에서 제거 확인, 지갑 1개일 때 삭제 버튼 비활성 확인 |
| F9 | App 전역의 accountIndex 하드코딩(Dashboard, Policy, Settings)이 useWalletStore 참조로 교체됨 | `grep -rn 'accountIndex: 0' packages/app/src/` 결과 0건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 | `npx tsc --noEmit` (protocol, daemon, app) |
| N2 | CI 체크 통과 | `npm run check` |
| N3 | 빌드 성공 | `npx expo export --platform web` 또는 해당 빌드 명령 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | Daemon 미연결 상태에서 Wallet 탭 진입 | 로딩 표시 후 연결되면 자동 조회 | 수동: 오프라인 → 온라인 전환 |
| E2 | 현재 선택 지갑 삭제 | accountIndex 0으로 자동 폴백 | 수동: 선택 지갑 삭제 후 index 0 활성 확인 |
| E3 | 지갑 0개 상태 (초기 enrollment 직후) | 빈 목록 표시 + 지갑 추가 안내 | 수동: 초기 상태 확인 |
| E4 | getWalletAddress query 실패 | 에러 표시, 재시도 가능 | 수동: daemon 중단 상태에서 확인 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. 현재 지갑 주소 확인/복사 | F4, F5 | ✅ |
| 2. 전체 지갑 목록(주소 포함) 조회 | F1, F2, F6 | ✅ |
| 3. 지갑 선택 → App 전역 반영 | F3, F6, F9 | ✅ |
| 4. 지갑 추가/삭제 | F7, F8 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| getWalletAddress query 추가 | F1, F2 | ✅ |
| useWalletStore (zustand) | F3, F9 | ✅ |
| 기존 sendApproval 경로 사용 | F7, F8 | ✅ |
| 주소 세션 캐시 | F4 (로딩 최소화) | ✅ |
