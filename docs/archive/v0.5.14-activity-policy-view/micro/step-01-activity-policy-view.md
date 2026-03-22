# Step 01: ActivityScreen 정책 뷰 재작성

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

- TD-1: 로컬 useState로 activePolicies, pendingPolicies, status 관리
- TD-2: DashboardScreen 패턴 reconnect/refetch (mount + accountIndex 변경 + relay 재연결)
- TD-3: useWalletStore.addresses에서 주소 표시
- TD-4: DEMO_CHAIN_ID = 999 하드코딩
- TD-5: status별 UI (loading/error/loaded/empty)
- TD-6: PolicyScreen의 transformDaemonPolicies 패턴 재사용

## 2. 완료 조건

- [ ] 기존 이벤트 타임라인 UI 코드 제거
- [ ] 활성 정책 목록 조회 + 표시 (relay.query('policyList'))
- [ ] 대기 정책 목록 조회 + 표시 (relay.query('pendingApprovals'))
- [ ] 지갑 주소 상단 표시 (useWalletStore)
- [ ] 로딩 스피너 표시
- [ ] 에러 상태: "정책을 불러올 수 없습니다" + 재시도 버튼
- [ ] 빈 상태: "등록된 정책이 없습니다"
- [ ] refetch: mount, accountIndex 변경, relay 재연결

### 통합 검증
- [ ] 변경 전/후 tsc baseline diff: 증가 0
- [ ] 수동: Activity 탭 진입 → 정책 표시
- [ ] 수동: Relay 끊긴 상태 → 에러 표시
- [ ] 수동: accountIndex 변경 → 재조회

## 3. 롤백 방법
- `git revert <commit>` — 단일 파일 변경

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/activity/screens/
└── ActivityScreen.tsx  # 재작성 - 이벤트 타임라인 → 정책 뷰
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| ActivityScreen.tsx | 직접 수정 | 전면 재작성 |
| useWalletStore | 읽기 의존 | selectedAccountIndex, addresses |
| RelayClient | 읽기 의존 | query(), isConnected(), addConnectionHandler() |
| useActivityStore | 간접 | 더 이상 사용 안 함 (import 제거). RootNavigator 참조는 유지 |

### Side Effect 위험
- 위험: RootNavigator에서 여전히 event_stream → useActivityStore dispatch 중
- 대응: 이번 Phase에서 건드리지 않음. 이벤트는 store에 쌓이지만 UI에서 안 읽음. 다음 Phase에서 정리.

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ActivityScreen.tsx | 전면 재작성 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| TD-1~TD-6 | ✅ ActivityScreen.tsx | OK |
| RootNavigator.tsx | 변경 불필요 확인 | OK |
| useActivityStore.ts | 변경 불필요 (import만 제거) | OK |
| usePolicyStore.ts | 변경 불필요 (로컬 상태 사용) | OK |

### 검증 통과: ✅
