# Step 05: Options depth 분리 (문제 5)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (타입 이름 변경 + constructor 시그니처 변경이므로 git revert로 복원)
- **선행 조건**: Step 04 (CronScheduler 느슨화) 완료

---

## 1. 구현 내용 (design.md 기반)

### CronSchedulerConfig
- `CronSchedulerOptions` -> `CronSchedulerConfig` 이름 변경
- `queueManager` 필드 제거 (Step 04에서 이미 dispatch 콜백으로 교체됨)
- `tickIntervalMs`를 required로 변경 (optional -> required, No Optional 원칙 준수)
- caller(index.ts)에서 기본값을 전달

### AdminServerConfig + AdminServerDeps
- `AdminServerOptions`를 `AdminServerConfig` (socketPath만) + `AdminServerDeps` (나머지 서비스 dependency)로 분리
- `AdminServerDeps`는 **export하지 않음** (타입 그래프에 노드로 잡히지 않음)
- `AdminServerDeps`에서 `wdkContext` 필드 제거 (v0.2.10에서 이미 불필요)
- AdminServer constructor 시그니처: `constructor (opts: AdminServerOptions)` -> `constructor (config: AdminServerConfig, deps: AdminServerDeps)`
- `index.ts`에서 AdminServer, CronScheduler 생성 코드 업데이트

## 2. 완료 조건

- [ ] `packages/daemon/src/cron-scheduler.ts`에 `export interface CronSchedulerConfig` 존재하고 `tickIntervalMs: number` 필드만 포함 (required)
- [ ] `CronSchedulerOptions` 이름이 `packages/daemon/src/` 내 어디에도 없음 (0건)
- [ ] `packages/daemon/src/admin-server.ts`에 `export interface AdminServerConfig` 존재하고 `socketPath: string` 필드만 포함
- [ ] `AdminServerOptions` 이름이 `packages/daemon/src/` 내 어디에도 없음 (0건)
- [ ] `packages/daemon/src/admin-server.ts`에 `AdminServerDeps`가 `export` 없이 정의됨 (`export.*AdminServerDeps` 0건)
- [ ] `AdminServerDeps`에 `wdkContext` 필드 없음 (`wdkContext`가 admin-server.ts에 0건)
- [ ] AdminServer constructor가 `(config: AdminServerConfig, deps: AdminServerDeps)` 시그니처
- [ ] `index.ts`에서 AdminServer 생성 시 2개 인자(config, deps) 전달
- [ ] `index.ts`에서 CronScheduler 생성 시 `config: CronSchedulerConfig` 전달 (tickIntervalMs가 required로 전달)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0 (DoD N1)
- [ ] 타입 그래프 max depth ≤ 5 (DoD N2): `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json` 후 depth 계산 스크립트 실행
- [ ] `AdminServerDeps` 노드가 타입 그래프 JSON에 없음 (DoD N4): `rg 'AdminServerDeps' docs/type-dep-graph/type-dep-graph.json` 결과 0건
- [ ] DoD: F5a, F5b, F5c, F5d, F5e, F5f, N2, N4 충족

## 3. 롤백 방법
- 롤백 절차: `git revert <commit>` -- Options 타입 이름 복원, constructor 시그니처 복원
- 영향 범위: `cron-scheduler.ts`, `admin-server.ts`, `index.ts`

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── cron-scheduler.ts   # 수정 - CronSchedulerOptions -> CronSchedulerConfig (required)
├── admin-server.ts     # 수정 - AdminServerOptions -> AdminServerConfig + AdminServerDeps 분리, constructor 변경
└── index.ts            # 수정 - AdminServer, CronScheduler 생성 코드 업데이트
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| cron-scheduler.ts | 직접 수정 | CronSchedulerOptions -> CronSchedulerConfig |
| admin-server.ts | 직접 수정 | AdminServerOptions -> AdminServerConfig + AdminServerDeps, constructor 변경 |
| index.ts | 직접 수정 | 두 클래스의 생성자 호출 코드 업데이트 |
| tool-surface.ts | 간접 영향 | admin-server.ts가 WDKContext import을 제거하면 tool-surface.ts 참조 감소 |

### Side Effect 위험
- 위험 1: AdminServer constructor 시그니처 변경으로 index.ts 컴파일 실패 -> 같은 커밋에서 index.ts 동시 수정으로 완화
- 위험 2: `AdminServerDeps`를 비공개로 하면 외부에서 AdminServerDeps 타입을 사용할 수 없음 -> daemon 패키지 내부에서만 사용되므로 문제 없음 (index.ts에서 객체 리터럴로 전달)
- 위험 3: `WDKContext` import 제거 시 admin-server.ts 내부에서 `this._wdkContext`를 사용하는 곳이 있는지 확인 -> 현재 `_dispatch` 메서드에서 `this._wdkContext`를 사용하지 않음. `status` 커맨드 등에서도 직접 사용하지 않음. 단, 설계 문서에서 "v0.2.10에서 제거"라고 명시하므로 이번 Step에서 wdkContext 관련 코드를 제거.

### 참고할 기존 패턴
- `message-queue.ts`의 `MessageQueueOptions`: config-only 패턴의 기존 사례

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.ts | CronSchedulerOptions -> CronSchedulerConfig | ✅ OK |
| admin-server.ts | AdminServerOptions -> AdminServerConfig + AdminServerDeps | ✅ OK |
| index.ts | 두 클래스의 생성자 호출 업데이트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| CronSchedulerConfig (required tickIntervalMs) | ✅ (cron-scheduler.ts) | OK |
| CronSchedulerOptions 이름 제거 | ✅ (cron-scheduler.ts) | OK |
| AdminServerConfig (socketPath only) | ✅ (admin-server.ts) | OK |
| AdminServerDeps (비공개) | ✅ (admin-server.ts) | OK |
| AdminServerDeps에서 wdkContext 제거 | ✅ (admin-server.ts) | OK |
| AdminServer constructor 시그니처 변경 | ✅ (admin-server.ts) | OK |
| index.ts 생성자 호출 업데이트 | ✅ (index.ts) | OK |
| admin-server.ts에서 WDKContext import 제거 | ✅ (admin-server.ts) -- wdkContext 필드 제거에 수반 | OK |
| admin-server.ts에서 tool-surface.ts import 필요 여부? | admin-server.ts가 `WDKContext`만 import하고 있었으므로 wdkContext 제거 시 `from './tool-surface.js'` import 전체 제거 가능. ✅ Scope에 반영됨 | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅
