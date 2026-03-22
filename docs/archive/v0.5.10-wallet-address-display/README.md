# Wallet Address Display + Multi-Wallet 관리 - v0.5.10

## 문제 정의

### 현상
- Wallet 탭(DashboardScreen)에 지갑 주소가 표시되지 않아 사용자가 자기 주소를 확인/복사할 수 없음
- App 전역에서 `accountIndex: 0` 하드코딩 — 멀티 월렛 전환 불가
- `walletList` query가 주소를 반환하지 않음 (accountIndex, name, createdAt만)
- protocol에 순수 주소 조회 query(`getWalletAddress`)가 없음
- 지갑 추가/삭제 UI 없음

### 원인
- v0.5.4에서 DB address 컬럼을 제거하고 런타임 파생을 SSOT로 확정했으나, query 채널에 주소 조회 경로를 추가하지 않음
- guarded-wdk facade에는 `listWallets()`, `getAccount().getAddress()` 모두 구현되어 있지만 App 레이어에서 활용하지 않음
- App에 wallet 도메인 자체가 없음 (디렉토리 미존재, store 미존재)

### 영향
- 사용자가 자기 지갑 주소를 알 수 없어 입금/공유 불가
- BIP-44 멀티 월렛 아키텍처(v0.2.0)가 App에서 사실상 사용 불가
- 모든 조회/트랜잭션이 첫 번째 지갑에 고정

### 목표
1. Wallet 탭에서 현재 지갑의 주소를 확인하고 복사할 수 있다
2. 등록된 전체 지갑 목록(주소 포함)을 조회할 수 있다
3. 지갑을 선택하면 App 전역에서 해당 지갑의 accountIndex를 사용한다
4. 새 지갑을 추가하고, 기존 지갑을 삭제할 수 있다

### 비목표 (Out of Scope)
- guarded-wdk facade 변경 (이미 완비)
- 멀티체인 지원 (현재 ethereum/999 단일 체인)
- 지갑 이름 수정 UI
- 지갑별 잔액 표시 (기존 getPortfolio가 처리)

## 제약사항
- App → Relay → Daemon → WDK 경로만 사용 (App에서 facade 직접 호출 불가)
- 주소는 런타임 파생 SSOT — 캐싱/저장 금지 (v0.5.4 설계 결정)
- query/query_result 채널은 WS 직접 전달 (Redis 미경유)
- 지갑 추가/삭제는 control 채널 (영속 메시지) 경유
