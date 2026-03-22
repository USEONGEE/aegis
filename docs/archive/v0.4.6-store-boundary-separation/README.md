# Store 경계 분리 (WdkStore / DaemonStore) — v0.4.6

## 문제 정의

### 현상

`ApprovalStore` 단일 추상 클래스가 WDK 도메인과 daemon 도메인의 데이터를 모두 담고 있다.

- **11개 카테고리**가 하나의 추상 클래스에 공존: master_seed, wallets, policies, pending_approvals, approval_history, signers, nonces, crons, execution_journal, rejection_history, policy_versions
- daemon이 store 참조를 직접 획득하여 WDK 도메인 데이터를 직접 CRUD (경로: `getApprovalStore()` + `initWDK()` raw store 반환)
- rejection 저장을 daemon(tool-surface.ts)이 수행 — WDK evaluatePolicy()에서 발생한 거부를 daemon이 catch하여 WDK DB에 기록하는 역방향 흐름
- execution journal을 daemon(execution-journal.ts)이 수행 — WDK 미들웨어가 실행한 tx의 추적을 daemon이 담당

### 원인

store를 단일 추상 클래스로 구성하고, 다중 경로로 daemon에게 store를 노출한 것이 근본 원인이다.

1. **`getApprovalStore()` 공개**: facade가 내부 store 참조를 그대로 반환 → 모든 테이블에 무제한 접근
2. **`initWDK()` raw store 반환**: `wdk-host.ts`의 `initWDK()`가 store 인스턴스를 직접 반환하고, `daemon/src/index.ts`에서 이를 journal, tool context, cron, admin에 그대로 주입
3. **shared ApprovalStore ownership**: WDK와 daemon이 동일한 store 인스턴스를 공유하여 소유권이 모호
4. **관심사 미분리**: cron(daemon 스케줄링), rejection(정책 평가 결과), journal(tx 실행 추적)이 같은 추상 클래스에 혼재
5. **역방향 쓰기 흐름**: daemon이 WDK DB에 직접 쓰는 패턴 (rejection, journal)이 No Two-Way Implements 원칙 위반

### 영향

1. **경계 위반 강제 불가**: daemon이 store 참조로 WDK 도메인 데이터를 직접 조작할 수 있어, facade를 우회하는 코드가 계속 생길 수 있음
2. **단일 책임 위반**: cron(daemon 전용)과 master_seed(WDK 보안)가 같은 추상 클래스에 공존
3. **역방향 의존**: daemon → WDK store 직접 쓰기 (rejection, journal)는 의존 방향 원칙에 어긋남
4. **테스트 복잡도**: daemon 테스트에서 WDK 테이블까지 초기화해야 함
5. **현재 직접 접근 현황**: tool-surface.ts 12건, execution-journal.ts 4건, cron-scheduler.ts 3건, admin-server.ts 2건, wdk-host.ts 2건

### 목표

1. **ApprovalStore → WdkStore + DaemonStore 분리**: 각 도메인이 자신의 store만 소유
2. **WDK 내부화**: rejection_history, execution_journal을 WDK 내부 로직으로 이동. WDK가 자신의 데이터를 직접 기록
3. **facade 경유 강제**: daemon → WDK 데이터 접근(읽기 포함)은 facade 메서드만 허용. `getApprovalStore()` 제거 + `initWDK()` raw store 반환 제거
4. **DaemonStore 최소화**: daemon 고유 관심사(cron)만 DaemonStore에 배치
5. **Runtime import 경계 강제**: daemon 패키지에서 WdkStore 구현체의 runtime import를 CI 체크로 차단. daemon은 facade 인터페이스만 참조. type-only import는 런타임에 무해하므로 허용
6. **런타임 DB 분리**: WDK DB와 daemon DB를 별도 SQLite 파일로 분리하여 물리적 격리

### 비목표 (Out of Scope)

1. **정책 엔진 리팩토링**: evaluatePolicy() 내부 로직 변경은 범위 밖. rejection 기록 훅만 추가
2. **미들웨어 리팩토링**: 미들웨어 구조 변경 없음. journal 기록 훅만 추가
3. **tool-surface 파일 분리**: daemon 내부 파일 구조 재편(tool-surface-wdk.ts / tool-surface-daemon.ts 분리)은 이번 Phase에서 다루지 않음. 단, facade 경유로 전환하면서 자연스럽게 정리되는 부분은 포함
4. **dead-exports 정리**: 별도 Phase에서 처리
5. **DB 엔진 변경**: SQLite 유지. PostgreSQL 등 외부 DB 전환은 범위 밖

## 확정 결정사항

### 데이터 마이그레이션 정책

**기존 로컬 SQLite DB는 폐기**한다. 새 스키마로 초기화하여 시작. 로컬 개발 환경이므로 데이터 손실 영향 없음. 자동 마이그레이션 스크립트는 작성하지 않는다.

### 테이블 소속

| 테이블 | 소속 | 근거 |
|--------|------|------|
| master_seed | WdkStore | WDK 보안 핵심 |
| wallets | WdkStore | WDK 도메인 |
| policies | WdkStore | WDK 도메인 |
| pending_approvals | WdkStore | WDK 도메인 |
| approval_history | WdkStore | WDK 도메인 |
| signers | WdkStore | WDK 도메인 |
| nonces | WdkStore | WDK 도메인 |
| policy_versions | WdkStore | savePolicy() 내부에서 자동 생성. WDK 완결 |
| rejection_history | **WdkStore (내부화)** | evaluatePolicy()에서 reject 시 자동 기록. daemon은 facade 경유 읽기만 |
| execution_journal | **WdkStore (내부화)** | WDK 미들웨어가 tx 실행하므로 실행 기록도 WDK 소유. daemon은 facade 경유 읽기만 |
| crons | **DaemonStore** | daemon 고유 스케줄링 관심사. WDK와 무관 |

### 접근 패턴

```
WdkStore (WDK 전용 — daemon은 import 불가)
  ├── master_seed, wallets, policies, pending, history, signers, nonces
  ├── policy_versions  (savePolicy 내부 자동 관리)
  ├── rejection_history (evaluatePolicy 내부 자동 기록) ← NEW
  └── execution_journal (미들웨어 내부 자동 기록) ← NEW
        ▲
        │ facade 경유만 허용 (읽기/쓰기 모두)
      daemon
        │ 직접 접근
        ▼
DaemonStore (daemon 전용 — 별도 SQLite 파일)
  └── crons
```

### daemon → WDK 데이터 접근 원칙

**읽기 포함 모든 접근은 facade 경유**. broker 포함 모든 내부 컴포넌트를 facade 뒤로 숨긴다. `getApprovalStore()`, `getBroker()` 모두 제거.

현재 직접 호출 경로 → facade 전환 매핑:
- `store.loadPolicy()` → `wdk.loadPolicy()`
- `store.loadPendingApprovals()` / `broker.getPendingApprovals()` → `wdk.getPendingApprovals()`
- `store.listRejections()` → `wdk.listRejections()`
- `store.listPolicyVersions()` → `wdk.listPolicyVersions()`
- `store.listSigners()` → `wdk.listSigners()`
- `store.listWallets()` → `wdk.listWallets()`

## 제약사항

- 선행 조건: v0.4.4 완료 (완료됨)
- `JsonApprovalStore`는 테스트에서 광범위하게 사용 — 테스트 깨짐 범위가 클 수 있음
- dead-exports 정리와 동시 진행 시 충돌 가능 — 순서 조율 필요
- CI 현황: 18 checks, 16 PASS / 2 FAIL (dead-exports 126건, no-public-verifier-export 1건)
- daemon의 기존 port interface (ToolStorePort, AdminStorePort, CronStore)는 이미 좁은 인터페이스로 정의되어 있음 — 이를 활용하여 facade 전환 설계 가능
