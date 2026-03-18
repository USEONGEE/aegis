# Step 18: daemon - OpenClaw client (OpenAI SDK wrapper)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 17 (tool-surface)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/openclaw-client.js` 생성. OpenAI SDK를 래핑하여 OpenClaw API(localhost:18789)와 통신하는 클라이언트를 구현한다.

- `createOpenClawClient(config)`: OpenAI SDK 인스턴스 생성 (`baseURL: config.openclawBaseUrl`, `apiKey: config.openclawApiKey`)
- `chat(userId, sessionId, messages)`: `client.chat.completions.create({ model: 'default', user: userId:sessionId, messages, tools: TOOL_DEFINITIONS })` 호출
- **Session 매핑**: `user` 필드에 `${userId}:${sessionId}` 형식으로 전달. OpenClaw가 세션별 컨텍스트를 관리
- **재시도 로직**: API 오류 시 3회 재시도 (exponential backoff: 1s, 2s, 4s). 3회 실패 시 에러 throw (DoD E10)
- **타임아웃**: 요청당 30초 타임아웃
- tool_call 응답 파싱: `response.choices[0].message.tool_calls` 배열 반환

## 2. 완료 조건
- [ ] `packages/daemon/src/openclaw-client.js` 에서 `createOpenClawClient` export
- [ ] `createOpenClawClient(config)` 가 OpenAI SDK 인스턴스를 `config.openclawBaseUrl` (기본 `http://localhost:18789`)로 생성
- [ ] `chat(userId, sessionId, messages)` 호출 시 `user` 필드가 `${userId}:${sessionId}` 형식
- [ ] `chat()` 호출 시 `tools` 에 TOOL_DEFINITIONS (9개) 포함
- [ ] API 오류 시 3회 재시도 (1s, 2s, 4s backoff)
- [ ] 3회 실패 시 에러 throw
- [ ] 요청 타임아웃 30초
- [ ] tool_call 배열을 포함한 응답 객체 반환
- [ ] `npm test -- packages/daemon` 통과 (openclaw-client 단위 테스트, mock OpenAI SDK)

## 3. 롤백 방법
- `packages/daemon/src/openclaw-client.js` 삭제
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  openclaw-client.js      # OpenAI SDK wrapper + session 매핑 + 재시도
packages/daemon/tests/
  openclaw-client.test.js # 단위 테스트 (mock OpenAI SDK)
```

### 수정 대상 파일
```
없음 (tool-call-loop에서 import — Step 19에서 연결)
```

### Side Effect 위험
- 네트워크 호출 (localhost:18789). 테스트에서는 mock 사용

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| openclaw-client.js | OpenAI SDK wrapper | ✅ OK |
| openclaw-client.test.js | 단위 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| createOpenClawClient | ✅ openclaw-client.js | OK |
| session 매핑 (userId:sessionId) | ✅ openclaw-client.js | OK |
| 재시도 로직 (3회, exponential backoff) | ✅ openclaw-client.js | OK |
| 타임아웃 (30s) | ✅ openclaw-client.js | OK |
| TOOL_DEFINITIONS 전달 | ✅ openclaw-client.js (tool-surface import) | OK |

### 검증 통과: ✅

---

→ 다음: [Step 19: daemon - tool-call 실행 루프](step-19-tool-call-loop.md)
