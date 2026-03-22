# 설계 - v0.5.10

## 변경 규모
**규모**: 일반 기능
**근거**: 3개 패키지(protocol, daemon, app) 수정, 신규 store 추가, 내부 query API 변경

---

## 문제 요약
App Wallet 탭에서 지갑 주소를 확인할 수 없고, accountIndex: 0 하드코딩으로 멀티 월렛 전환이 불가능하다.

> 상세: [README.md](README.md) 참조

## 접근법

기존 인프라를 최대한 활용한다:
- **query 채널**: `getWalletAddress` query 타입 추가 (경량 주소 조회)
- **control 채널**: `wallet_create`, `wallet_delete` — 이미 구현 완료, App UI만 연결
- **App store**: `useWalletStore` (zustand) — 현재 선택 지갑 + 지갑 목록 관리
- **DashboardScreen 확장**: 주소 표시, 지갑 선택, 추가/삭제 UI

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: walletList query 확장 (주소 포함 반환) | 한 번의 query로 목록+주소 | facade에서 N번 getAddress() 호출 필요, 지갑 많으면 느림 | ❌ |
| B: 별도 getWalletAddress query 추가 | 경량, 필요할 때만 호출, facade 변경 없음 | 지갑별 개별 호출 필요 | ✅ |
| C: getPortfolio에서 주소만 추출 | 추가 구현 없음 | 잔액까지 조회하여 무거움, 목적 불일치 | ❌ |

**선택 이유**: B 방식은 기존 tool-surface.ts의 `getWalletAddress` 패턴과 동일하며, query-handler에 case 하나만 추가하면 된다. walletList는 주소 없이 유지하여 목록 조회를 가볍게 유지.

## 기술 결정

1. **getWalletAddress query**: protocol QueryType에 추가, daemon query-handler에서 `facade.getAccount(chain, index).getAddress()` 호출
2. **useWalletStore**: zustand + AsyncStorage persist. 현재 선택된 accountIndex 추적 + 지갑 목록 캐시
3. **지갑 생성/삭제**: 기존 `sendApproval()` → `SignedApprovalBuilder.forWallet()` 경로 그대로 사용
4. **주소 조회 시점**: 지갑 선택 시 + Wallet 탭 진입 시 getWalletAddress query 호출
5. **주소 캐싱**: useWalletStore에 `addresses: Record<number, string>` — 세션 내 캐시만 (persist 대상 아님, SSOT 원칙)

---

## 범위 / 비범위
- **범위(In Scope)**: protocol query 타입 추가, daemon query-handler 확장, useWalletStore 생성, DashboardScreen UI 확장, accountIndex 하드코딩 제거 (3곳), 지갑 추가/삭제 UI
- **비범위(Out of Scope)**: guarded-wdk facade 변경, 멀티체인 지원, 지갑 이름 수정, Relay 변경

## 아키텍처 개요

```
App (useWalletStore)
  │
  ├─ query: getWalletAddress(chain, accountIndex) ──→ Relay ──→ Daemon ──→ facade.getAccount().getAddress()
  ├─ query: walletList ──→ Relay ──→ Daemon ──→ facade.listWallets()
  ├─ control: wallet_create (sendApproval) ──→ Relay ──→ Redis ──→ Daemon ──→ facade.submitApproval()
  └─ control: wallet_delete (sendApproval) ──→ Relay ──→ Redis ──→ Daemon ──→ facade.submitApproval()
```

## API/인터페이스 계약

### 신규 query 타입

```typescript
// protocol/src/query.ts
| { type: 'getWalletAddress'; requestId: string; params: { chain: string; accountIndex: number } }
```

### 응답

```typescript
// QueryResult.data
{ address: string }
```

## 테스트 전략

- **타입 체크**: `npx tsc --noEmit` — protocol, daemon, app 전체 통과
- **수동 검증**: Wallet 탭에서 주소 표시/복사, 지갑 전환, 추가/삭제 동작 확인
- **기존 CI 체크**: `npm run check` 통과

## 리스크/오픈 이슈

- **주소 파생 지연**: getAddress()가 느릴 경우 UI가 빈 상태로 보일 수 있음 → 로딩 상태 표시로 대응
- **지갑 삭제 후 선택**: 현재 선택된 지갑 삭제 시 자동으로 index 0으로 폴백
