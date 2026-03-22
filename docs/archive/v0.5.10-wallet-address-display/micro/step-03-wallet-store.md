# Step 03: useWalletStore 생성

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음 (App 내부, Step 01/02와 독립)

---

## 1. 구현 내용 (design.md 기반)
- `useWalletStore` 생성 (zustand + persist)
- Persisted 상태: `selectedAccountIndex: number` (기본값 0)
- Transient 상태: `wallets: StoredWallet[]`, `addresses: Record<number, string>`, `isLoading: boolean`
- Actions: `selectWallet(index)`, `setWallets(list)`, `setAddress(index, addr)`, `reset()`

## 2. 완료 조건
- [ ] `packages/app/src/stores/useWalletStore.ts` 파일 존재
- [ ] `selectedAccountIndex` 상태가 persist됨 (AsyncStorage)
- [ ] `wallets`, `addresses`는 persist 대상 아님 (transient)
- [ ] `selectWallet(index)` 호출 시 `selectedAccountIndex` 업데이트
- [ ] `npx tsc --noEmit` 통과 (app 패키지)

## 3. 롤백 방법
- 파일 삭제 + import 제거 → 원복

---

## Scope

### 수정 대상 파일
없음

### 신규 생성 파일
```
packages/app/src/stores/useWalletStore.ts  # 신규 — 지갑 선택 상태 관리
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| zustand | 의존 | 기존 프로젝트 의존성 |
| AsyncStorage | 의존 | persist storage (기존 useChatStore 패턴) |

### Side Effect 위험
없음 — 신규 파일, 기존 코드 미수정

### 참고할 기존 패턴
- `stores/useChatStore.ts` — zustand + persist + transient 상태 분리 패턴
- `stores/useAuthStore.ts` — 단순 store 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| useWalletStore.ts (신규) | store 생성 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| selectedAccountIndex persist | ✅ | OK |
| wallets/addresses transient | ✅ | OK |
| actions | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: DashboardScreen UI](step-04-dashboard-ui.md)
