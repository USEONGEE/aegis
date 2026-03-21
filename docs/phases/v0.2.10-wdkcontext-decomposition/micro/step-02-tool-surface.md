# Step 02: tool-surface.ts 변경 (WDKContext -> ToolExecutionContext)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 (ports.ts 존재)

---

## 1. 구현 내용 (design.md 7.2 기반)

- `WDKContext` interface를 `ToolExecutionContext`로 이름 변경
- `broker: any` -> `broker: ApprovalBrokerPort` 타입 교체
- `store: any` -> `store: ToolStorePort` 타입 교체
- `relayClient?: RelayClient` 필드 제거 (optional 필드 제거, "No Optional" 원칙 준수)
- `import type { RelayClient }` 제거 (더 이상 사용하지 않음)
- `import type { ToolStorePort, ApprovalBrokerPort } from './ports.js'` 추가
- `executeToolCall` 파라미터명: `wdkContext` -> `ctx` (선택적, 일관성)
- 함수 내부 destructuring `const { wdk, broker, store, logger, journal } = ctx`는 변수명이 동일하므로 로직 변경 없음

## 2. 완료 조건

- [ ] `WDKContext`라는 이름이 tool-surface.ts에 없음 (`rg 'WDKContext' packages/daemon/src/tool-surface.ts` 결과 0건)
- [ ] `ToolExecutionContext` interface가 export 되어 있음 (`rg 'export interface ToolExecutionContext' packages/daemon/src/tool-surface.ts` 결과 1건)
- [ ] `broker` 필드 타입이 `ApprovalBrokerPort`임 (`rg 'broker: ApprovalBrokerPort' packages/daemon/src/tool-surface.ts` 결과 1건)
- [ ] `store` 필드 타입이 `ToolStorePort`임 (`rg 'store: ToolStorePort' packages/daemon/src/tool-surface.ts` 결과 1건)
- [ ] `relayClient` 필드가 `ToolExecutionContext`에 없음 (`rg 'relayClient' packages/daemon/src/tool-surface.ts` 결과 0건)
- [ ] `import type { RelayClient }` 구문이 tool-surface.ts에 없음
- [ ] `import type { ToolStorePort, ApprovalBrokerPort } from './ports.js'` 구문이 존재함
- [ ] `broker: any` 또는 `store: any`가 tool-surface.ts에 없음

## 3. 롤백 방법

- 롤백 절차: `git revert <commit>` (Step 02 커밋)
- 영향 범위: 이 단계 이후 Step 03-05가 import 변경을 완료하지 않았다면 컴파일 에러 발생 가능. Step 02만 롤백할 경우 Step 03-06도 함께 롤백해야 함.

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── tool-surface.ts  # 수정 - WDKContext -> ToolExecutionContext, any -> Port, relayClient 제거
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `./ports.js` | 신규 import | ToolStorePort, ApprovalBrokerPort 타입 가져옴 |
| `./relay-client.js` | import 제거 | relayClient 필드 제거로 RelayClient import 불필요 |
| `tool-call-loop.ts` | 간접 영향 | WDKContext를 import하던 코드가 깨짐 (Step 03에서 해결) |
| `chat-handler.ts` | 간접 영향 | WDKContext를 import하던 코드가 깨짐 (Step 04에서 해결) |
| `cron-scheduler.ts` | 간접 영향 | WDKContext를 import하던 코드가 깨짐 (Step 05에서 해결) |
| `admin-server.ts` | 간접 영향 | WDKContext를 import하던 코드가 깨짐 (Step 06에서 해결) |
| `index.ts` | 간접 영향 | WDKContext를 import하던 코드가 깨짐 (Step 07에서 해결) |

### Side Effect 위험
- **컴파일 에러 전파**: Step 02 완료 후 Step 03-07 완료 전까지 `tsc --noEmit`이 실패함 (WDKContext export가 사라지므로). 이는 의도된 중간 상태이며, Step 08에서 최종 검증.

### 참고할 기존 패턴
- `packages/daemon/src/tool-surface.ts:25-32`: 현재 WDKContext 정의 (이 블록을 교체)
- `packages/daemon/src/tool-surface.ts:321`: executeToolCall 시그니처 (파라미터 타입 변경)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-surface.ts | design.md 7.2: WDKContext -> ToolExecutionContext + any -> Port | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| WDKContext -> ToolExecutionContext 이름 변경 | ✅ tool-surface.ts | OK |
| broker: any -> ApprovalBrokerPort | ✅ tool-surface.ts | OK |
| store: any -> ToolStorePort | ✅ tool-surface.ts | OK |
| relayClient? 제거 | ✅ tool-surface.ts | OK |
| RelayClient import 제거 | ✅ tool-surface.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 03: tool-call-loop.ts 변경](step-03-tool-call-loop.md)
