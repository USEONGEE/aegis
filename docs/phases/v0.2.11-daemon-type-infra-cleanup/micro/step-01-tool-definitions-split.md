# Step 01: TOOL_DEFINITIONS 분리 (문제 1)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (파일 생성 + import 경로 변경이므로 git revert로 복원)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

- `src/ai-tool-schema.ts` 신규 생성: `ToolDefinition` interface + `TOOL_DEFINITIONS` const를 이동
- `src/tool-surface.ts`에서 `ToolDefinition` interface 정의와 `TOOL_DEFINITIONS` const 제거
- `src/openclaw-client.ts`의 import 경로를 `./tool-surface.js` -> `./ai-tool-schema.js`로 변경
- `src/tool-call-loop.ts`의 import를 분리: `TOOL_DEFINITIONS`/`ToolDefinition`은 `./ai-tool-schema.js`에서, `executeToolCall`/`WDKContext`/`ToolResult`는 `./tool-surface.js`에서

## 2. 완료 조건

- [ ] `packages/daemon/src/ai-tool-schema.ts` 파일이 존재하고 `export interface ToolDefinition` 포함
- [ ] `packages/daemon/src/ai-tool-schema.ts` 파일에 `export const TOOL_DEFINITIONS: ToolDefinition[]` 포함
- [ ] `packages/daemon/src/tool-surface.ts`에 `ToolDefinition` interface 정의 없음 (0건)
- [ ] `packages/daemon/src/tool-surface.ts`에 `TOOL_DEFINITIONS` const 없음 (0건)
- [ ] `packages/daemon/src/openclaw-client.ts`에 `from './ai-tool-schema` import 존재 (1건)
- [ ] `packages/daemon/src/openclaw-client.ts`에 `from './tool-surface` import 없음 (0건)
- [ ] `packages/daemon/src/tool-call-loop.ts`에 `from './ai-tool-schema` import 존재 (1건)
- [ ] `packages/daemon/src/tool-call-loop.ts`에 `executeToolCall`은 여전히 `from './tool-surface` import
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0 (DoD N1)
- [ ] `npx tsx scripts/type-dep-graph/index.ts --include=daemon --json && npx tsx scripts/type-dep-graph/verify.ts` exit 0 — 순환 의존 0개 (DoD N3, E1)
- [ ] DoD: F1a, F1b, F1c, F1d, F1e, N3, E1 충족

## 3. 롤백 방법
- 롤백 절차: `git revert <commit>` 후 `ai-tool-schema.ts` 삭제 확인
- 영향 범위: `tool-surface.ts`, `openclaw-client.ts`, `tool-call-loop.ts`의 import만 원복

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
└── ai-tool-schema.ts    # 신규 - ToolDefinition interface + TOOL_DEFINITIONS const
```

### 수정 대상 파일
```
packages/daemon/src/
├── tool-surface.ts      # 수정 - ToolDefinition interface, TOOL_DEFINITIONS const 제거
├── openclaw-client.ts   # 수정 - import 경로 변경 (tool-surface -> ai-tool-schema)
└── tool-call-loop.ts    # 수정 - import 분리 (schema는 ai-tool-schema, execution은 tool-surface)
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| ai-tool-schema.ts | 신규 생성 | ToolDefinition + TOOL_DEFINITIONS의 새 소유자 |
| tool-surface.ts | 직접 수정 | 2개 export 제거 (ToolDefinition, TOOL_DEFINITIONS) |
| openclaw-client.ts | 직접 수정 | import source 변경 |
| tool-call-loop.ts | 직접 수정 | import source 분리 |

### Side Effect 위험
- 위험 1: tool-surface.ts에서 TOOL_DEFINITIONS를 제거하면 tool-surface.ts의 다른 함수가 이를 참조하지 않는지 확인 필요 -> 현재 tool-surface.ts 내부에서 TOOL_DEFINITIONS를 사용하지 않음 (executeToolCall은 name으로 dispatch). 안전.

### 참고할 기존 패턴
- `packages/daemon/src/config.ts`: 독립 모듈에서 type + const를 export하는 기존 패턴

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ai-tool-schema.ts (신규) | ToolDefinition + TOOL_DEFINITIONS 이동 대상 | ✅ OK |
| tool-surface.ts | ToolDefinition, TOOL_DEFINITIONS 제거 | ✅ OK |
| openclaw-client.ts | ToolDefinition import 경로 변경 | ✅ OK |
| tool-call-loop.ts | TOOL_DEFINITIONS, ToolDefinition import 경로 변경 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ai-tool-schema.ts 생성 | ✅ | OK |
| tool-surface.ts에서 2 export 제거 | ✅ | OK |
| openclaw-client.ts import 변경 | ✅ | OK |
| tool-call-loop.ts import 분리 | ✅ | OK |
| 다른 파일에서 ToolDefinition import? | chat-handler.ts, cron-scheduler.ts, admin-server.ts, index.ts는 ToolDefinition을 import하지 않음 (확인 완료) | OK -- 누락 없음 |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 02: Queue 타입 유도형 전환](step-02-queue-type-derive.md)
