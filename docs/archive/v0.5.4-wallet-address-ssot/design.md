# 설계 - v0.5.4

## 변경 규모
**규모**: 일반 기능
**근거**: 2개+ 패키지 수정 (guarded-wdk, daemon), 내부 API 변경 (createWallet 시그니처), 데이터 스키마 변경 (wallets 테이블)

---

## 문제 요약
`wallets.address` 컬럼이 항상 빈 문자열로 저장됨. 주소는 seed + account_index에서 deterministic하게 derive되므로 저장이 불필요하고, 빈 문자열이 혼란만 유발.

> 상세: [README.md](README.md) 참조

## 접근법
- `wallets` 테이블에서 `address` 컬럼 제거
- `StoredWallet` 타입에서 `address` 필드 제거
- `createWallet()` 시그니처에서 `address` 파라미터 제거
- 주소가 필요한 곳은 런타임 `wdk.getAccount(chain, accountIndex).getAddress()` 호출

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: address 컬럼 제거 | SSOT 단일화, dead column 정리, 타입 정직 | 마이그레이션 필요, 테스트 수정 | ✅ |
| B: 빈 문자열 대신 실제 주소 저장 | 캐시 역할, DB 쿼리만으로 주소 조회 가능 | 이중 소스, derive 결과와 불일치 가능성, 멀티체인 시 체인별 주소 관리 복잡 | ❌ |
| C: 현상 유지 | 변경 없음 | 빈 문자열이 NOT NULL로 계속 남음, 혼란 지속 | ❌ |

**선택 이유**: A — address는 deterministic derivation의 결과물이므로 저장은 중복. 빈 문자열을 NOT NULL로 저장하는 것은 타입이 거짓말하는 것.

## 기술 결정
- SQLite `wallets` 테이블 재생성 (ALTER TABLE DROP COLUMN 대신 — SQLite 구버전 호환)
- `WalletRow` (DB 내부 타입)에서도 address 제거
- `StoredWallet` (외부 타입)에서 address 제거
- daemon `admin-server.ts`의 wallet_list 응답에서 address 제거
- 기존 DB는 데이터가 빈 문자열이므로 마이그레이션 시 데이터 손실 없음

---

## 범위 / 비범위
- **범위(In Scope)**: wallets 스키마, StoredWallet/WalletRow 타입, createWallet 시그니처, 관련 테스트
- **비범위(Out of Scope)**: getAddress() 호출 추가, 멀티체인 주소 관리, App UI 주소 표시

## 데이터 모델/스키마

### Before
```sql
CREATE TABLE wallets (
  account_index INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

### After
```sql
CREATE TABLE wallets (
  account_index INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

## 테스트 전략
- 기존 store 테스트에서 address 파라미터/assertion 제거
- `createWallet(accountIndex, name)` 호출로 변경
- `StoredWallet` 반환값에서 address 검증 제거
- CI 체크 통과 확인 (`npm test`, `npx tsc --noEmit`)
