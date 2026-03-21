# Step 01: ports.ts 생성 (Port Interface 정의)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (신규 파일 삭제)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 7.1 기반)

- `packages/daemon/src/ports.ts` 신규 생성
- `ToolStorePort` interface 정의 (9개 메서드)
  - `getPolicyVersion`, `loadPolicy`, `loadPendingApprovals`
  - `saveRejection`, `listRejections`
  - `saveCron`, `listCrons`, `removeCron`
  - `listPolicyVersions`
- `ApprovalBrokerPort` interface 정의 (1개 메서드)
  - `createRequest`
- `AdminStorePort` interface 정의 (2개 메서드)
  - `listSigners`, `listWallets`
- `CreateRequestOptions` interface 정의 (ApprovalBrokerPort 내부 사용)
- import 대상: `@wdk-app/guarded-wdk`에서 필요한 타입만 `import type`으로 가져옴

## 2. 완료 조건

- [ ] `packages/daemon/src/ports.ts` 파일이 존재함
- [ ] `ToolStorePort` interface에 정확히 9개 메서드가 정의됨 (`grep 'Promise<' ports.ts | wc -l` 결과에서 ToolStorePort 영역이 9)
- [ ] `ApprovalBrokerPort` interface에 `createRequest` 1개 메서드만 정의됨
- [ ] `AdminStorePort` interface에 `listSigners`, `listWallets` 2개 메서드만 정의됨
- [ ] 3개 Port interface가 모두 `export` 되어 있음
- [ ] `CreateRequestOptions` interface가 정의됨 (export 여부는 무관)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 | grep 'error TS' | wc -l` 결과 ≤ 4 (baseline 이하)

## 3. 롤백 방법

- 롤백 절차: `rm packages/daemon/src/ports.ts`
- 영향 범위: 없음 (신규 파일이므로 다른 파일에 영향 없음)

---

## Scope

### 수정 대상 파일
없음

### 신규 생성 파일
```
packages/daemon/src/
└── ports.ts    # 신규 - ToolStorePort, ApprovalBrokerPort, AdminStorePort 정의
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `@wdk-app/guarded-wdk` | import type | StoredPolicy, PendingApprovalRequest, CronInput, StoredCron, RejectionEntry, RejectionQueryOpts, PolicyVersionEntry, ApprovalType, ApprovalRequest, StoredSigner, StoredWallet |

### Side Effect 위험
- 없음 (신규 파일 추가만, 기존 코드 변경 없음)

### 참고할 기존 패턴
- `packages/daemon/src/cron-scheduler.ts:41-45`: 이미 존재하는 `CronStore` interface 패턴 (로컬 Port 패턴의 선례)
- `packages/daemon/src/wdk-host.ts:17-19`: `WDKInstance` Pick 타입 패턴

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ports.ts | design.md 7.1: 3개 Port interface 정의 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ToolStorePort (9 메서드) | ✅ ports.ts | OK |
| ApprovalBrokerPort (1 메서드) | ✅ ports.ts | OK |
| AdminStorePort (2 메서드) | ✅ ports.ts | OK |
| CreateRequestOptions | ✅ ports.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 02: tool-surface.ts 변경](step-02-tool-surface.md)
