# Step 07: index.ts 변경 (ToolExecutionContext 조립 + AdminServer 옵션 변경)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02-06 (모든 소비자가 ToolExecutionContext를 사용하도록 변경 완료)

---

## 1. 구현 내용 (design.md 7.7 기반)

- `import type { WDKContext }` -> `import type { ToolExecutionContext }` 변경
- WDKContext 조립부 변경:
  - `const wdkContext: WDKContext = { wdk, broker, store, logger, journal, relayClient }` ->
  - `const ctx: ToolExecutionContext = { wdk: wdk!, broker, store, logger, journal }` (relayClient 제거)
- 변수명 `wdkContext` -> `ctx` 변경 (모든 참조):
  - `handleChatMessage(..., wdkContext, ...)` -> `handleChatMessage(..., ctx, ...)`
  - `_processChatDirect(..., wdkContext, ...)` -> `_processChatDirect(..., ctx, ...)`
  - `new CronScheduler(store, wdkContext, ...)` -> `new CronScheduler(store, ctx, ...)`
- AdminServer 생성자 옵션에서 `wdkContext` 제거:
  - `new AdminServer({ ..., wdkContext, ... })` -> `new AdminServer({ ..., ... })` (wdkContext 프로퍼티 삭제)
- 주석 업데이트: "Build WDK context" -> "Build tool execution context" (또는 유사 표현)

## 2. 완료 조건

- [ ] `WDKContext`라는 이름이 index.ts에 없음 (`rg 'WDKContext' packages/daemon/src/index.ts` 결과 0건)
- [ ] `ToolExecutionContext`가 import 되어 있음 (`rg 'ToolExecutionContext' packages/daemon/src/index.ts` 결과 1건 이상)
- [ ] `wdkContext` 변수명이 index.ts에 없음 (`rg 'wdkContext' packages/daemon/src/index.ts` 결과 0건)
- [ ] ctx 객체에 `relayClient` 프로퍼티가 없음
- [ ] AdminServer 생성자 호출에 `wdkContext` 프로퍼티가 없음
- [ ] handleChatMessage, _processChatDirect, CronScheduler 호출에서 `ctx`를 전달함

## 3. 롤백 방법

- 롤백 절차: `git revert <commit>` (Step 07 커밋)
- 영향 범위: 이 단계가 마지막 코드 변경이므로, 롤백 시 Step 02-06의 변경과 불일치 발생. Step 02-07을 함께 롤백해야 함.

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── index.ts  # 수정 - import 변경, ctx 조립, 모든 하위 모듈 호출부 변경, AdminServer 옵션 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `./tool-surface.js` | import 변경 | WDKContext -> ToolExecutionContext |
| `./chat-handler.js` | 호출부 변경 | handleChatMessage, _processChatDirect에 ctx 전달 |
| `./cron-scheduler.js` | 호출부 변경 | CronScheduler 생성자에 ctx 전달 |
| `./admin-server.js` | 호출부 변경 | AdminServer 생성자에서 wdkContext 제거 |

### Side Effect 위험
- **relayClient 제거 확인**: ToolExecutionContext에서 relayClient가 제거되므로, tool-surface.ts 내부에서 relayClient를 사용하는 코드가 없는지 확인 필요. design.md 2.4 매트릭스에 따르면 tool-surface.ts는 relayClient를 사용하지 않음 (확인 완료).
- **broker/store 타입 호환**: index.ts에서 `broker` (SignedApprovalBroker)를 `ApprovalBrokerPort` 위치에, `store` (SqliteApprovalStore)를 `ToolStorePort` 위치에 넘김. TypeScript structural typing으로 자동 호환.

### 참고할 기존 패턴
- `packages/daemon/src/index.ts:17`: `import type { WDKContext }` (변경)
- `packages/daemon/src/index.ts:56-63`: WDKContext 조립 블록 (ctx로 교체)
- `packages/daemon/src/index.ts:71`: `_processChatDirect(..., wdkContext, ...)` (변수명 변경)
- `packages/daemon/src/index.ts:77`: `wdkContext` in queueManager callback
- `packages/daemon/src/index.ts:96`: `handleChatMessage(..., wdkContext, ...)` (변수명 변경)
- `packages/daemon/src/index.ts:141`: `new CronScheduler(store, wdkContext, ...)` (변수명 변경)
- `packages/daemon/src/index.ts:147-155`: `new AdminServer({ ..., wdkContext, ... })` (wdkContext 제거)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| index.ts | design.md 7.7: ctx 조립 + 모든 호출부 변경 + AdminServer 옵션 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| import WDKContext -> ToolExecutionContext | ✅ index.ts | OK |
| ctx 조립 (relayClient 제거) | ✅ index.ts | OK |
| handleChatMessage 호출부 변수명 변경 | ✅ index.ts | OK |
| _processChatDirect 호출부 변수명 변경 | ✅ index.ts | OK |
| CronScheduler 생성자 변수명 변경 | ✅ index.ts | OK |
| AdminServer 생성자 wdkContext 제거 | ✅ index.ts | OK |
| 주석 업데이트 | ✅ index.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 08: 최종 검증](step-08-verify.md)
