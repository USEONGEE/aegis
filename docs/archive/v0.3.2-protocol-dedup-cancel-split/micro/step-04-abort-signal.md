# Step 04: AbortSignal 전파

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 03 (cancelActive가 abort signal을 발생시킴)

---

## 1. 구현 내용 (design.md 기반)

- `packages/daemon/src/openclaw-client.ts`:
  - `OpenClawClient` interface의 `chat()` 시그니처에 `opts?: { signal?: AbortSignal }` 파라미터 추가
  - `OpenClawClient` interface의 `chatStream()` 시그니처에 `opts?: { signal?: AbortSignal }` 파라미터 추가
  - `createOpenClawClient` 구현부에서 `opts?.signal`을 OpenAI SDK의 `client.chat.completions.create()` 호출에 전달
    - 비스트리밍: `{ ...params, signal: opts?.signal }` (OpenAI SDK core.d.ts:215 지원 확인됨)
    - 스트리밍: 동일하게 signal 전달
- `packages/daemon/src/tool-call-loop.ts`:
  - `processChat()` 내부에서 `openclawClient.chat()` 호출 시 `{ signal }` 전달
  - `openclawClient.chatStream()` 호출 시 `{ signal }` 전달
  - 기존 루프 시작의 `signal.aborted` 체크는 유지

## 2. 완료 조건
- [ ] `packages/daemon/src/openclaw-client.ts`에서 `signal.*AbortSignal` 패턴이 2건 이상 존재 (F19, F20 — chat + chatStream)
- [ ] `packages/daemon/src/tool-call-loop.ts`에서 `{ signal }` 패턴이 2건 이상 존재 (F21 — chat + chatStream 호출 시)
- [ ] `OpenClawClient` interface의 `chat` 메서드에 `opts` 파라미터 존재
- [ ] `OpenClawClient` interface의 `chatStream` 메서드에 `opts` 파라미터 존재
- [ ] 기존 `signal.aborted` 체크 (tool-call-loop.ts:80) 유지

## 3. 롤백 방법
- 롤백 절차: git에서 openclaw-client.ts, tool-call-loop.ts 복원
- 영향 범위: signal 미전달 시 기존 동작 (abort가 HTTP 요청을 중단하지 못함)으로 복귀. 기능 퇴화이지 에러는 아님.

---

## Scope

### 수정 대상 파일
```
packages/daemon/
└── src/
    ├── openclaw-client.ts  # 수정 - chat/chatStream에 signal 파라미터 추가
    └── tool-call-loop.ts   # 수정 - signal을 openclawClient.chat/chatStream에 전달
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| openclaw-client.ts | 직접 수정 | interface + 구현부 시그니처 변경 |
| tool-call-loop.ts | 직접 수정 | signal 전달 추가 |
| openai (npm) | 간접 영향 | SDK가 signal을 지원하는지 확인 필요 (확인됨: core.d.ts:215) |
| chat-handler.ts | 간접 영향 | `_processChatDirect`에서 `processChat`에 signal 전달 — 이미 전달 중 (chat-handler.ts:104). 변경 불요 |

### Side Effect 위험
- 위험 1: OpenAI SDK 버전에 따라 signal 지원 여부 상이
  - 대응: design.md에서 `core.d.ts:215` 확인 완료. 현재 설치 버전에서 동작 검증 필요.
- 위험 2: signal 전달 후 abort 시 OpenAI SDK가 던지는 에러 타입 확인
  - 대응: chat-handler.ts:155의 `signal?.aborted` 체크가 이미 abort 에러를 catch. 추가 변경 불요.

### 참고할 기존 패턴
- `packages/daemon/src/tool-call-loop.ts:80`: 기존 signal.aborted 체크
- `packages/daemon/src/chat-handler.ts:155-163`: abort 시 cancelled 이벤트 전송

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| openclaw-client.ts | chat/chatStream signal 파라미터 | ✅ OK |
| tool-call-loop.ts | signal 전달 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| OpenClawClient interface 변경 | ✅ openclaw-client.ts | OK |
| createOpenClawClient 구현부 변경 | ✅ openclaw-client.ts | OK |
| processChat에서 signal 전달 | ✅ tool-call-loop.ts | OK |
| chat-handler.ts 변경 | ❌ 변경 불요 | OK (이미 signal 전달 중) |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 05: app import 변경 + cancel 분기](step-05-app-cancel.md)
