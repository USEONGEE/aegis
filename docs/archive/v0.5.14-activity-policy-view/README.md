# Activity 정책 뷰 - v0.5.14

## 문제 정의

### 현상
- Activity 탭이 이벤트 타임라인(IntentProposed, PolicyEvaluated 등)을 보여주지만, 데모에서 실질적으로 유용하지 않다.
- 현재 지갑에 어떤 정책이 활성화되어 있는지, AI가 요청한 정책이 대기 중인지 한눈에 볼 수 없다.
- PolicyScreen이 존재하지만 탭 네비게이션에 연결되어 있지 않아 접근 불가.

### 원인
- Activity 탭이 이벤트 로그 용도로만 설계되어 있고, 현재 상태(active policies, pending policies)를 보여주는 뷰가 없다.
- 정책 조회 API(`policyList`, `pendingApprovals`)는 daemon에 이미 존재하지만, Activity 탭에서 사용하지 않는다.

### 영향
- 데모 시 "현재 이 지갑의 보안 상태"를 즉시 보여줄 수 없다.
- AI가 정책을 요청하고 사용자가 승인한 후, 결과를 확인하려면 별도 화면을 만들거나 코드를 봐야 한다.

### 목표
- Activity 탭의 기존 이벤트 타임라인을 제거하고, 정책 뷰로 대체한다.
- accountIndex 기준으로 선택 → 해당 지갑의 주소 표시 + 활성 정책 목록 + 대기 중 정책 목록.
- 조회 실패(연결 끊김/타임아웃)와 정책 없음을 구분하여 표시한다.
- refetch triggers: 화면 진입(mount), accountIndex 변경, relay 재연결 시 자동 재조회.
- 데모 수준으로 최소한으로 구현한다.

### 비목표 (Out of Scope)
- 정책 편집/삭제/승인/거절 UI (조회 전용)
- 여러 체인(chainId) 동시 표시 (데모는 chain 999만 사용)
- 기존 이벤트 타임라인 보존 (제거함)
- Relay/Daemon 측 변경 (기존 query 채널 사용)

## 제약사항
- App 코드(packages/app)만 수정. Daemon/Relay 변경 없음.
- 정책 조회는 기존 WS query 채널 사용: `relay.query('policyList', {accountIndex, chainId})` + `relay.query('pendingApprovals', {accountIndex})`. Relay HTTP endpoint 추가 불필요.
- Query 채널은 비영속(WS 직접, Redis bypass) — 연결 끊긴 상태에서는 조회 불가. RelayClient.query()에 10초 타임아웃 내장.
- 정책 데이터는 transient (persist 불필요) — daemon의 SQLite가 SSOT. 앱은 조회만.
