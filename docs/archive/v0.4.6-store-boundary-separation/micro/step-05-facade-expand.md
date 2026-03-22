# Step 05: Facade 확장 + getApprovalStore/getBroker 제거

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (feature branch 권장)
- **선행 조건**: Step 01 (WdkStore), Step 03 (rejection), Step 04 (journal)

---

## 1. 구현 내용 (design.md 섹션 5)

- `GuardedWDKFacade`에 읽기 메서드 7개 추가: loadPolicy, getPendingApprovals, listRejections, listPolicyVersions, listSigners, listWallets, listJournal
- `GuardedWDKFacade`에 broker 흡수 메서드 3개 추가: submitApproval, createApprovalRequest, setTrustedApprovers
- `getApprovalStore()`, `getApprovalBroker()`/`getBroker()` 제거
- WDKInstance와 GuardedWDKFacade를 단일 facade 객체로 통합
- daemon `ports.ts`: ToolStorePort → WdkFacadePort, AdminStorePort → AdminFacadePort, ApprovalBrokerPort 제거
- daemon `wdk-host.ts`: `WDKInitResult` → `{ facade: GuardedWDKFacade | null }`, store 참조 폐기 (옵션 C)
- daemon `index.ts`: facade 기반 context 구성 (`{ facade, cronStore, logger }`)
- daemon `tool-surface.ts`: store/broker → facade 사용
- daemon `admin-server.ts`: facade 사용
- daemon `control-handler.ts`: broker → facade.submitApproval

## 2. 완료 조건
- [ ] `grep -n "getApprovalStore\|getApprovalBroker\|getBroker" packages/guarded-wdk/src/guarded-wdk-factory.ts` 결과 0건
- [ ] facade에서 7개 읽기 메서드 호출 가능 (통합 테스트: `facade.loadPolicy()` 등이 store 데이터 반환)
- [ ] facade에서 3개 broker 메서드 호출 가능
- [ ] `WDKInitResult` 타입이 `{ facade: GuardedWDKFacade | null }` (wdk/broker/store 개별 필드 없음)
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 성공
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 성공
- [ ] DoD: F10, F11, F12, F13, E3

## 3. 롤백 방법
- feature branch — daemon 전 파일 수정이므로 위험 높음
- 기존 control-handler 테스트의 모든 케이스 통과 필수 확인

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── guarded-wdk-factory.ts     # facade 메서드 추가, getApprovalStore/getBroker 제거
├── index.ts                   # export 정리 (SignedApprovalBroker export 유지, 사용 금지만)

packages/daemon/src/
├── ports.ts                   # ToolStorePort→WdkFacadePort, AdminStorePort→AdminFacadePort
├── wdk-host.ts                # WDKInitResult 변경, store 참조 폐기
├── index.ts                   # facade 기반 context
├── tool-surface.ts            # store/broker→facade
├── admin-server.ts            # store→facade
└── control-handler.ts         # broker→facade.submitApproval
```

### 테스트 파일
```
packages/guarded-wdk/tests/
├── factory.test.ts                # facade 메서드 호출 테스트 추가
└── integration.test.ts            # facade 경유 전체 흐름 검증

packages/daemon/tests/
├── tool-surface.test.ts           # store/broker → facade mock 교체
└── control-handler.test.ts        # broker → facade.submitApproval 교체
```

### Side Effect 위험
- **높음**: 모든 daemon-WDK 상호작용 변경. 기능 회귀 가능
- control-handler의 승인 기능이 깨지면 앱에서 승인 불가

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-wdk/index.ts | SignedApprovalBroker export 유지 — 이 step에서는 삭제 안 함 | ✅ OK (export 정리는 안 하지만 확인은 필요) |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| facade 읽기 메서드 7개 | ✅ guarded-wdk-factory.ts | OK |
| facade broker 메서드 3개 | ✅ guarded-wdk-factory.ts | OK |
| WDKInitResult 변경 | ✅ wdk-host.ts | OK |
| 테스트 파일 4개 | ✅ 추가됨 | OK |

### 검증 통과: ✅

---

→ 다음: [Step 06: CI 경계 체크 + DB 분리](step-06-ci-boundary.md)
