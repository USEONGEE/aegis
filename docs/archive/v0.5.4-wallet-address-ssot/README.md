# Wallet Address SSOT — v0.5.4

## 문제 정의

### 현상
- `wallets` 테이블에 `address TEXT NOT NULL` 컬럼이 존재하지만, 실제로는 항상 빈 문자열(`''`)로 저장됨
- `signed-approval-broker.ts`에서 `createWallet(accountIndex, name, '')` — address에 빈 문자열 전달
- 런타임에는 `wdk.getAccount(chain, index).getAddress()`로 주소를 derive하여 사용
- 저장된 address와 런타임 address가 분리되어 있어 어떤 것이 정본(SSOT)인지 불분명

### 원인
- EVM 주소는 `seed + account_index`에서 deterministic하게 derive되므로 별도 저장이 불필요
- 초기 스키마 설계 시 address 컬럼을 넣었지만, 실제 derivation 로직은 `@tetherto/wdk`에 위임되면서 저장 로직이 구현되지 않음
- v0.5.1 (EVM Wallet Bootstrap)에서 월렛 생성은 구현했지만 주소 persist는 skip

### 영향
- `StoredWallet.address`가 항상 빈 문자열 → 이 필드를 신뢰하는 코드는 잘못된 결과를 얻음
- 주소가 필요한 곳에서 매번 `getAccount().getAddress()`를 호출해야 하는데, 어디서는 DB를, 어디서는 런타임을 참조할지 혼란
- 빈 문자열이 `NOT NULL` 제약을 통과하면서 "데이터가 있는 것처럼" 보이지만 실제로는 무의미

### 목표
- `wallets` 테이블에서 `address` 컬럼 제거
- `createWallet()` 시그니처에서 address 파라미터 제거
- `StoredWallet` 타입에서 address 필드 제거
- 주소가 필요한 곳은 `wdk.getAccount(chain, accountIndex).getAddress()`를 SSOT로 사용
- DB는 `account_index`만 관리, 주소는 항상 derivation으로 획득

### 비목표 (Out of Scope)
- 주소 캐싱 레이어 구현 (derivation이 충분히 빠르므로 불필요)
- 멀티체인 주소 관리 체계 변경
- `@tetherto/wdk` 내부 derivation 로직 수정
- App UI에서 주소 표시 기능 (현재 미구현, 별도 phase)

## 제약사항
- `wallets` 테이블 스키마 변경 → 기존 DB 마이그레이션 필요 (현재 데이터가 빈 문자열이므로 데이터 손실 없음)
- `StoredWallet` 타입을 사용하는 모든 패키지(guarded-wdk, daemon)의 참조 업데이트 필요
- Breaking change — 설계 원칙 #4에 따라 허용
