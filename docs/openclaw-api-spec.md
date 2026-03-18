# OpenClaw Gateway API Spec (for daemon)

daemon이 로컬 OpenClaw 게이트웨이와 통신하기 위한 API 명세.
OpenClaw은 **OpenAI 호환 API**를 제공하므로, OpenAI SDK/라이브러리를 그대로 사용 가능.

---

## 기본 정보

| 항목 | 값 |
|---|---|
| Base URL | `http://localhost:18789` |
| 인증 | `Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>` |
| 프로토콜 | HTTP (로컬 통신이므로 TLS 불필요) |

### 인증 설정

OpenClaw config (`~/.openclaw/openclaw.json`):
```json
{
  "gateway": {
    "auth": {
      "mode": "token",
      "token": "your-secret-token"
    }
  }
}
```

또는 환경변수: `OPENCLAW_GATEWAY_TOKEN=your-secret-token`

---

## API Endpoints

### 1. Chat Completions (비스트리밍)

daemon이 사용자 메시지를 OpenClaw에 전달하고 완성된 응답을 받는 방식.

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>
```

#### Request Body

```json
{
  "model": "default",
  "stream": false,
  "messages": [
    { "role": "user", "content": "Aave health factor 확인해줘" }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `model` | string | X | 모델 지정. `"default"` 또는 생략하면 config 기본값 사용 |
| `stream` | boolean | X | `false` = 완성 후 한번에 응답 (기본) |
| `messages` | array | O | OpenAI 포맷 메시지 배열 |
| `messages[].role` | string | O | `"user"`, `"assistant"`, `"system"` |
| `messages[].content` | string \| array | O | 텍스트 또는 멀티모달 콘텐츠 |
| `user` | string | X | 사용자 식별자 (세션 라우팅에 사용) |

#### Response (200 OK)

```json
{
  "id": "chatcmpl_abc-123",
  "object": "chat.completion",
  "created": 1710720000,
  "model": "default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "현재 Aave health factor는 1.85입니다. 안전한 수준입니다."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**주의**: `usage` 필드는 항상 0으로 반환됨. 실제 토큰 사용량은 OpenClaw 내부에서 추적.

#### Error Responses

```json
// 400 Bad Request
{
  "error": {
    "message": "Missing user message in `messages`.",
    "type": "invalid_request_error"
  }
}

// 401 Unauthorized (토큰 오류)

// 500 Internal Server Error
{
  "error": {
    "message": "internal error",
    "type": "api_error"
  }
}
```

---

### 2. Chat Completions (스트리밍) — 권장

daemon이 실시간으로 토큰 단위 응답을 받아 Relay로 중계하는 방식.

```
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>
```

#### Request Body

```json
{
  "model": "default",
  "stream": true,
  "messages": [
    { "role": "user", "content": "Aave health factor 확인해줘" }
  ]
}
```

#### Response (200 OK, SSE 스트림)

```
Content-Type: text/event-stream

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","created":1710720000,"model":"default","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","created":1710720000,"model":"default","choices":[{"index":0,"delta":{"content":"현재"},"finish_reason":null}]}

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","created":1710720000,"model":"default","choices":[{"index":0,"delta":{"content":" Aave"},"finish_reason":null}]}

data: {"id":"chatcmpl_abc","object":"chat.completion.chunk","created":1710720000,"model":"default","choices":[{"index":0,"delta":{"content":" health factor는"},"finish_reason":null}]}

...

data: [DONE]
```

#### SSE 이벤트 순서

```
1. role chunk   — { delta: { role: "assistant" } }         (1회)
2. content chunks — { delta: { content: "..." } }          (N회, 토큰 단위)
3. [DONE]       — 스트림 종료
```

#### daemon에서 SSE 파싱

```javascript
const response = await fetch('http://localhost:18789/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  },
  body: JSON.stringify({
    model: 'default',
    stream: true,
    messages: [{ role: 'user', content: userMessage }],
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') break;

    const chunk = JSON.parse(data);
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      // Relay로 실시간 전달
      relay.send({ type: 'stream', delta: content });
    }
  }
}

relay.send({ type: 'done' });
```

---

### 3. 멀티턴 대화 (세션 유지)

OpenClaw은 **세션키 기반**으로 대화를 구분함.
같은 세션키로 요청하면 이전 대화를 이어감 (JSONL 히스토리).

세션키는 `user` 필드 + `model` 필드로 자동 생성됨:

```json
{
  "model": "default",
  "user": "user_123",
  "messages": [
    { "role": "user", "content": "두번째 질문" }
  ]
}
```

**주의**: OpenClaw이 세션을 자체 관리하므로, daemon은 전체 히스토리를 보낼 필요 없음.
마지막 사용자 메시지만 보내면 됨. OpenClaw이 이전 대화를 JSONL에서 자동 로딩.

```javascript
// daemon 코드 — 매번 마지막 메시지만 보내면 됨
await fetch('/v1/chat/completions', {
  body: JSON.stringify({
    model: 'default',
    user: userId,
    stream: true,
    messages: [{ role: 'user', content: latestMessage }],
  }),
});
// OpenClaw이 세션키 "openai:<user>:<model>" 로 이전 대화를 자동 이어감
```

---

### 4. System Prompt 추가

`system` 또는 `developer` role로 추가 시스템 프롬프트 전달 가능:

```json
{
  "model": "default",
  "messages": [
    {
      "role": "system",
      "content": "You have access to WDK CLI for DeFi operations. Use `wdk exec` for transactions."
    },
    { "role": "user", "content": "Aave에 USDC 500 repay해줘" }
  ]
}
```

`system` role 메시지는 OpenClaw의 기본 시스템 프롬프트에 **추가**됨 (대체가 아님).

---

### 5. 이미지 전송 (멀티모달)

```json
{
  "model": "default",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "이 차트 분석해줘" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgo..."
          }
        }
      ]
    }
  ]
}
```

| 제한 | 값 |
|---|---|
| 최대 이미지 수 | 8개 |
| 최대 총 이미지 크기 | 20MB |
| 지원 포맷 | PNG, JPEG, GIF, WebP |
| URL 이미지 | 기본 비활성 (base64만) |

---

## daemon 구현 예시

```javascript
// packages/daemon/src/openclaw-client.js

const OPENCLAW_BASE = 'http://localhost:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

export async function sendToOpenClaw({ userId, message, onDelta, onDone }) {
  const response = await fetch(`${OPENCLAW_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
    },
    body: JSON.stringify({
      model: 'default',
      stream: true,
      user: userId,
      messages: [{ role: 'user', content: message }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        onDone(fullText);
        return;
      }

      try {
        const chunk = JSON.parse(data);
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onDelta(content);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  onDone(fullText);
}
```

### daemon에서 Relay 연동

```javascript
// packages/daemon/src/bridge.js

import { sendToOpenClaw } from './openclaw-client.js';

relay.on('message', async (msg) => {
  await sendToOpenClaw({
    userId: msg.userId,
    message: msg.text,
    onDelta: (delta) => {
      relay.send({ type: 'stream', sessionId: msg.sessionId, delta });
    },
    onDone: (fullText) => {
      relay.send({ type: 'done', sessionId: msg.sessionId, text: fullText });
    },
  });
});
```

---

## OpenClaw 실행 요구사항

daemon이 실행되기 전에 OpenClaw 게이트웨이가 실행 중이어야 함:

```bash
# OpenClaw 게이트웨이 시작
openclaw gateway run --bind loopback --port 18789 --force

# 상태 확인
openclaw gateway status --deep
```

### WDK CLI를 도구로 등록

OpenClaw이 WDK CLI를 사용할 수 있게 config에 등록:

```json
// ~/.openclaw/openclaw.json
{
  "tools": {
    "exec": {
      "safeBins": ["wdk"]
    }
  }
}
```

또는 MCP로 연동시:

```json
{
  "mcp": {
    "servers": {
      "wdk": {
        "command": "wdk",
        "args": ["mcp-serve"]
      }
    }
  }
}
```

---

## 요약: daemon ↔ OpenClaw 통신 흐름

```
Relay에서 메시지 수신 (WebSocket)
  |
  v
daemon: POST /v1/chat/completions (stream: true)
  |
  v
OpenClaw 게이트웨이 (localhost:18789)
  |  세션 해석 → 모델 선택 → 시스템 프롬프트 조립
  |  → LLM API 호출 → 도구 실행 (WDK CLI 포함) → 응답 생성
  |
  v
SSE 스트리밍 응답
  |  data: { delta: { content: "현재" } }
  |  data: { delta: { content: " health" } }
  |  ...
  |  data: [DONE]
  |
  v
daemon: 각 delta를 Relay로 즉시 전달 (WebSocket)
  |
  v
Relay → RN App (실시간 표시)
```
