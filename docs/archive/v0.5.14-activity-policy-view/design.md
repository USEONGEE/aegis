# 설계 - v0.5.14

## 변경 규모
**규모**: 일반 기능
**근거**: 1파일 주요 재작성 (ActivityScreen.tsx) + 내부 UI 변경

---

## 문제 요약
Activity 탭의 이벤트 타임라인을 제거하고, 현재 지갑의 활성 정책 + 대기 정책을 보여주는 정책 뷰로 대체한다.

> 상세: [README.md](README.md) 참조

## 접근법

ActivityScreen을 완전 재작성하여 정책 뷰로 교체한다. DashboardScreen의 reconnect/refetch 패턴을 그대로 따른다. 기존 `relay.query('policyList', ...)` + `relay.query('pendingApprovals', ...)` API를 사용.

## 범위 / 비범위

**범위 (In Scope)**:
- ActivityScreen.tsx 재작성 (정책 뷰)
- 지갑 주소 표시 (useWalletStore.addresses)
- 활성 정책 + 대기 정책 목록 표시
- 로딩/에러/빈 상태 구분
- refetch: mount, accountIndex 변경, relay 재연결

**비범위 (Out of Scope)**:
- useActivityStore 수정/삭제 (RootNavigator에서 아직 이벤트 dispatch 중 — 나중에 정리)
- usePolicyStore 수정 (ActivityScreen에서 로컬 상태로 관리)
- RootNavigator 수정
- Daemon/Relay 변경

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: ActivityScreen 직접 재작성 (로컬 상태) | 가장 단순, store 변경 불필요, 독립적 | 정책 데이터가 다른 화면에서 공유 안 됨 | ✅ |
| B: usePolicyStore 확장 + ActivityScreen 연결 | 상태 공유 가능 | PolicyScreen이 네비게이션에 없어 공유 의미 없음, store 변경 필요 | ❌ |

**선택 이유**: A — PolicyScreen이 네비게이션에 없어 상태 공유 필요 없음. 데모 수준이므로 로컬 상태가 가장 단순.

## 기술 결정

### TD-1: 상태 관리 — 로컬 useState

```typescript
const [activePolicies, setActivePolicies] = useState<Policy[]>([]);
const [pendingPolicies, setPendingPolicies] = useState<PendingPolicy[]>([]);
const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'loaded'>('idle');
```

`status`로 로딩/에러/빈/데이터 4가지 상태 구분.

### TD-2: Refetch 패턴 — DashboardScreen과 동일

```typescript
useEffect(() => {
  const connHandler = (isConnected: boolean) => {
    if (isConnected) fetchPolicies();
  };
  relay.addConnectionHandler(connHandler);
  if (relay.isConnected()) fetchPolicies();
  return () => relay.removeConnectionHandler(connHandler);
}, [relay, fetchPolicies]);

// accountIndex 변경 시 재조회
useEffect(() => {
  if (relay.isConnected()) fetchPolicies();
}, [selectedAccountIndex]);
```

### TD-3: 주소 표시 — useWalletStore.addresses

`useWalletStore`의 `addresses[selectedAccountIndex]`에서 주소를 읽는다. DashboardScreen이 이미 주소를 조회하므로, Activity 탭 진입 시점에 주소가 이미 있을 수 있다. 없으면 별도 조회.

### TD-4: 체인 ID — 데모 하드코딩

```typescript
const DEMO_CHAIN_ID = 999; // HyperEVM
```

### TD-5: 에러/빈 상태 UI 구분

| status | 표시 |
|--------|------|
| `idle` / `loading` | 로딩 스피너 |
| `error` | "정책을 불러올 수 없습니다" + 재시도 버튼 |
| `loaded` (정책 있음) | 활성 정책 목록 + 대기 정책 목록 |
| `loaded` (정책 없음) | "등록된 정책이 없습니다" |

### TD-6: 정책 데이터 변환 + 필터링

- `policyList` 응답: daemon의 `Policy[]` 그대로 표시. 데모에서는 `call` 타입만 존재 (`timestamp` policy는 데모 경로에서 발생하지 않음).
- `pendingApprovals` 응답: 모든 approval type이 반환되므로 `type === 'policy'`로 필터 필수 (PolicyScreen과 동일).

### TD-7: 주소 fallback

`useWalletStore.addresses[selectedAccountIndex]`가 비어있으면 (Dashboard 진입 전 Activity 먼저 열기) `relay.query('getWalletAddress', {accountIndex, chain: DEMO_CHAIN_ID})`로 직접 조회. 주소 미확보 시 축약 placeholder 표시.

## 테스트 전략

수동 검증:
1. 정상 조회: Activity 탭 진입 → 정책 목록 표시
2. 에러 상태: Relay 연결 끊긴 상태 → "불러올 수 없습니다" 표시
3. 재연결: Relay 재연결 시 자동 재조회
4. accountIndex 변경: 다른 지갑 선택 시 정책 재조회
5. tsc baseline 악화 없음

## 마이그레이션

N/A: UI 교체만. 데이터 마이그레이션 불필요.
