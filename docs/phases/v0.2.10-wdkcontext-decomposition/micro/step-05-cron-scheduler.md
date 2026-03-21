# Step 05: cron-scheduler.ts 변경 (WDKContext -> ToolExecutionContext)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02 (tool-surface.ts에서 ToolExecutionContext export)

---

## 1. 구현 내용 (design.md 7.5 기반)

- `import type { WDKContext }` -> `import type { ToolExecutionContext }` 변경
- 클래스 필드: `private _wdkContext: WDKContext` -> `private _ctx: ToolExecutionContext`
- 생성자 파라미터: `wdkContext: WDKContext` -> `ctx: ToolExecutionContext`
- 생성자 내부: `this._wdkContext = wdkContext` -> `this._ctx = ctx`
- `tick()` 내부: `processChat(..., this._wdkContext, ...)` -> `processChat(..., this._ctx, ...)` 호출부 변경

## 2. 완료 조건

- [ ] `WDKContext`라는 이름이 cron-scheduler.ts에 없음 (`rg 'WDKContext' packages/daemon/src/cron-scheduler.ts` 결과 0건)
- [ ] `ToolExecutionContext`가 import 되어 있음 (`rg 'ToolExecutionContext' packages/daemon/src/cron-scheduler.ts` 결과 1건 이상)
- [ ] `_wdkContext` 필드명이 없음 (`rg '_wdkContext' packages/daemon/src/cron-scheduler.ts` 결과 0건)
- [ ] `_ctx: ToolExecutionContext` 필드가 존재함
- [ ] `tick()` 내부에서 `this._ctx`를 processChat에 전달

## 3. 롤백 방법

- 롤백 절차: `git revert <commit>` (Step 05 커밋)
- 영향 범위: index.ts에서 CronScheduler 생성자 호출부 (Step 07에서 정합)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── cron-scheduler.ts  # 수정 - import 변경, 필드 타입/이름 변경, 생성자 파라미터 변경, tick() 내부 참조 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `./tool-surface.js` | import 변경 | WDKContext -> ToolExecutionContext |
| `index.ts` | 간접 영향 | CronScheduler 생성자 호출 시 파라미터명이 달라지나 타입이 동일하면 문제 없음. Step 07에서 정합 |

### Side Effect 위험
- 없음. import 타입명, 필드명, 파라미터명만 변경. 런타임 동작에 영향 없음.
- 주의: CronStore interface(cron-scheduler.ts:41-45)는 변경하지 않음. ToolStorePort와 메서드가 겹치지만(saveCron, listCrons, removeCron), CronStore는 cron-scheduler 내부 로컬 Port이므로 유지.

### 참고할 기존 패턴
- `packages/daemon/src/cron-scheduler.ts:2`: `import type { WDKContext }` (이 줄 변경)
- `packages/daemon/src/cron-scheduler.ts:63`: `private _wdkContext: WDKContext` (필드 변경)
- `packages/daemon/src/cron-scheduler.ts:75`: constructor 파라미터 (타입 변경)
- `packages/daemon/src/cron-scheduler.ts:82`: `this._wdkContext = wdkContext` (할당 변경)
- `packages/daemon/src/cron-scheduler.ts:200`: `processChat(..., this._wdkContext, ...)` (호출 변경)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.ts | design.md 7.5: import + 필드 + 생성자 + tick 호출 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| import WDKContext -> ToolExecutionContext | ✅ cron-scheduler.ts | OK |
| 필드 _wdkContext -> _ctx 변경 | ✅ cron-scheduler.ts | OK |
| 생성자 파라미터 타입 변경 | ✅ cron-scheduler.ts | OK |
| tick() 내부 호출부 변경 | ✅ cron-scheduler.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 06: admin-server.ts 변경](step-06-admin-server.md)
