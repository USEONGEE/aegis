# Step 03: Chat handler 단순화 + tool-call-loop 제거

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01, Step 02

---

## 1. 구현 내용 (design.md 기반)

- `tool-call-loop.ts` 삭제 (197줄) — OpenClaw이 loop 관리
- `openclaw-client.ts` 단순화:
  - SSE 파서(`parseSSEStream`) 제거
  - `convertMessagesToInput` 제거 (follow-up tool results 불필요)
  - `chatStream()` 제거 — Phase 1에서는 비스트리밍만
  - `chat()` 만 유지: `/v1/responses` 호출 → 최종 텍스트만 반환
  - 반환 타입을 `ChatResponse` → 단순 `string | null`로 변경
- `chat-handler.ts`의 `_processChatDirect()` 단순화:
  - `processChat()` 호출 제거 → `openclawClient.chat()` 직접 호출
  - `onDelta`, `onToolStart`, `onToolDone` 콜백 제거
  - 최종 텍스트만 relay에 전송 (type: 'done')
- `index.ts` 에서 processChat import 제거
- 불필요 타입 정리 (ChatMessage, ToolCall 등 — OpenClaw 내부로 이동)

## 2. 완료 조건
- [ ] `tool-call-loop.ts` 파일 없음
- [ ] `openclaw-client.ts`에 SSE 파서 코드 없음
- [ ] `openclaw-client.ts`에 `chatStream()` 메서드 없음
- [ ] `chat-handler.ts`에 `processChat` import 없음
- [ ] `chat-handler.ts`에 `onDelta`, `onToolStart`, `onToolDone` 콜백 없음
- [ ] Daemon 로그에서 OpenClaw `/v1/responses` 호출 확인
- [ ] `npx tsc --noEmit` 에러 0
- [ ] 기존 relay 이벤트 중 `type: 'done'` 정상 발송

## 3. 롤백 방법
- `git revert` 또는 삭제된 파일 git checkout으로 복구
- 영향 범위: daemon 패키지 내 3개 파일

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── openclaw-client.ts  # 수정 - SSE/stream/converter 제거, chat()만 유지
├── chat-handler.ts     # 수정 - processChat 의존 제거, 직접 호출
└── index.ts            # 수정 - processChat import 제거
```

### 삭제 대상 파일
```
packages/daemon/src/
└── tool-call-loop.ts   # 삭제 - OpenClaw이 loop 관리
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| tool-call-loop.ts | 삭제 | OpenClaw 내부로 이관 |
| openclaw-client.ts | 대폭 수정 | 인터페이스 단순화 |
| chat-handler.ts | 수정 | processChat 의존 제거 |
| index.ts | 수정 | import 정리 |
| ai-tool-schema.ts | 참조 변경 | tool-call-loop에서 import 했으나 삭제 후 불필요할 수 있음 |

### Side Effect 위험
- relay로 전송하는 `stream`, `tool_start`, `tool_done` 이벤트 제거 → App UI에서 해당 이벤트 핸들러가 동작 안 함 (UX 저하이나 기능적 문제 아님)

### 참고할 기존 패턴
- 현재 `_processChatDirect()` 구조를 단순화

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| tool-call-loop.ts (삭제) | OpenClaw이 loop 관리 | ✅ OK |
| openclaw-client.ts | SSE/stream 제거 | ✅ OK |
| chat-handler.ts | processChat 의존 제거 | ✅ OK |
| index.ts | import 정리 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ai-tool-schema.ts import 정리 | ⚠️ | tool-call-loop 삭제 후 TOOL_DEFINITIONS를 import하는 곳이 없을 수 있음 → HTTP Tool API에서는 사용하지 않으므로 확인 필요. 단, 플러그인 스키마 원본으로 참조 유지되므로 파일 자체는 유지 |

### 검증 통과: ✅

---

→ 다음: [Step 04: Docker 구성 변경](step-04-docker-config.md)
