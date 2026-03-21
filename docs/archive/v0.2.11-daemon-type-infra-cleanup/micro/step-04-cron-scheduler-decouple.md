# Step 04: CronScheduler 느슨화 (문제 4)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (constructor 시그니처 변경 + import 제거이므로 git revert로 복원)
- **선행 조건**: Step 03 (Cron 타입 통합) 완료

---

## 1. 구현 내용 (design.md 기반)

- `src/cron-scheduler.ts`에 `CronDispatch` type 추가: `(cronId, sessionId, userId, prompt, chainId) => Promise<void>`
- CronScheduler constructor 시그니처 변경:
  - Before: `constructor (store, wdkContext, openclawClient, logger, opts)`
  - After: `constructor (store, logger, dispatch: CronDispatch, opts)` (opts는 Step 05에서 Config로 이름 변경)
- `tick()` 내 분기 제거 (queueManager vs processChat) -> `this._dispatch(...)` 단일 호출
- `cron-scheduler.ts`에서 3개 import 제거: `processChat` (value import from tool-call-loop), `OpenClawClient` (type import from openclaw-client), `MessageQueueManager` (type import from message-queue)
- `src/index.ts`에서 `cronDispatch` 콜백 함수 정의 후 CronScheduler 생성자에 전달

## 2. 완료 조건

- [ ] `packages/daemon/src/cron-scheduler.ts`에 `export type CronDispatch` 정의 존재
- [ ] `CronDispatch` 시그니처가 `(cronId: string, sessionId: string, userId: string, prompt: string, chainId: number | null) => Promise<void>`
- [ ] CronScheduler constructor에 `dispatch: CronDispatch` 파라미터 존재
- [ ] `cron-scheduler.ts`에 `MessageQueueManager` 참조 없음 (0건)
- [ ] `cron-scheduler.ts`에 `processChat` 참조 없음 (0건)
- [ ] `cron-scheduler.ts`에 `OpenClawClient` 참조 없음 (0건)
- [ ] `cron-scheduler.ts`에 `from './tool-call-loop` import 없음 (0건)
- [ ] `cron-scheduler.ts`에 `from './openclaw-client` import 없음 (0건)
- [ ] `cron-scheduler.ts`에 `from './message-queue` import 없음 (0건)
- [ ] `tick()` 메서드에 `if (this._queueManager)` 분기 없음 (0건)
- [ ] `tick()` 메서드에 `this._dispatch(...)` 호출 존재
- [ ] `index.ts`에서 `CronDispatch` 타입의 콜백이 정의되어 CronScheduler 생성자에 전달됨
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0 (DoD N1)
- [ ] `index.ts`에서 CronDispatch 콜백이 queue enqueue 로직을 포함 (DoD E2): `rg -A5 'CronDispatch' packages/daemon/src/index.ts` 에서 enqueue 확인
- [ ] DoD: F4a, F4b, F4c, F4d, F4e, E2 충족

## 3. 롤백 방법
- 롤백 절차: `git revert <commit>` -- constructor 시그니처 복원, import 복원, tick() 분기 복원
- 영향 범위: `cron-scheduler.ts`, `index.ts`

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── cron-scheduler.ts   # 수정 - CronDispatch 추가, constructor 변경, tick() 분기 제거, import 3개 제거
└── index.ts            # 수정 - cronDispatch 콜백 정의, CronScheduler 생성자 호출 변경
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| cron-scheduler.ts | 직접 수정 | constructor 시그니처 변경, tick() 로직 변경 |
| index.ts | 직접 수정 | CronScheduler 생성 코드 변경 (인자 순서, cronDispatch 콜백 추가) |
| tool-call-loop.ts | 간접 영향 (제거 방향) | cron-scheduler.ts가 더 이상 import하지 않음 |
| openclaw-client.ts | 간접 영향 (제거 방향) | cron-scheduler.ts가 더 이상 import하지 않음 |
| message-queue.ts | 간접 영향 (제거 방향) | cron-scheduler.ts가 더 이상 import하지 않음 |

### Side Effect 위험
- 위험 1: CronScheduler constructor 시그니처 변경으로 index.ts 컴파일 실패 -> 같은 커밋에서 index.ts 동시 수정으로 완화
- 위험 2: 현재 `else` 분기(direct processChat)가 dead code인지 확인 필요 -> index.ts에서 항상 `queueManager`를 전달하므로 `else` 분기는 dead code. 제거해도 기능 변경 없음
- 위험 3: cron-scheduler.ts에서 `WDKContext` type import 제거 가능한지 확인 -> constructor에서 `wdkContext`를 제거하므로 `WDKContext` import도 제거 가능. 단, 다른 용도가 없는지 확인 필요 -> 없음 (확인 완료)

### 참고할 기존 패턴
- `message-queue.ts`의 `MessageProcessor` 콜백 타입: `(msg: QueuedMessage, signal: AbortSignal) => Promise<void>` -- 동일한 콜백 주입 패턴

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.ts | CronDispatch 추가, constructor 변경, tick() 변경, import 제거 | ✅ OK |
| index.ts | cronDispatch 콜백 정의 + CronScheduler 생성자 호출 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| CronDispatch 타입 정의 | ✅ (cron-scheduler.ts) | OK |
| constructor 시그니처 변경 | ✅ (cron-scheduler.ts) | OK |
| tick() 분기 제거 | ✅ (cron-scheduler.ts) | OK |
| import 3개 제거 | ✅ (cron-scheduler.ts) | OK |
| WDKContext import 제거 | ✅ (cron-scheduler.ts) -- wdkContext 파라미터 제거에 수반 | OK |
| cronDispatch 콜백 정의 | ✅ (index.ts) | OK |
| CronScheduler 생성자 호출 업데이트 | ✅ (index.ts) | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 05: Options depth 분리](step-05-options-depth-split.md)
