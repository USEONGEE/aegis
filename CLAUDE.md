# WDK-APP

AI DeFi Agent 서명 엔진 + 제어 인프라.

## 현재 페이즈

### v0.5.15 — EVM Wallet Manager
- **상태**: 개발 완료 (커밋 대기)
- **문서**: [docs/phases/v0.5.15-evm-wallet-manager/](docs/phases/v0.5.15-evm-wallet-manager/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.5.15-evm-wallet-manager`
- **시작일**: 2026-03-23

## 완료된 페이즈

[CHANGELOG.md](CHANGELOG.md) 참조. 완료 문서는 [docs/archive/](docs/archive/)에 보관.

## 프로젝트 구조

```
packages/
  guarded-wdk/      ← 서명 엔진 (@tetherto/wdk 래퍼)
  manifest/         ← DeFi tool 카탈로그 (tx + policy 빌더)
  daemon/           ← orchestration host
  relay/            ← Relay Server
  app/              ← RN App (Expo)
  openclaw-plugin/  ← OpenClaw AI 도구 플러그인
```

## 핵심 원칙

1. WDK = 서명 엔진. DeFi 로직은 manifest 패키지.
2. AI는 policy를 요청할 수 있지만, 승인할 수 없다.
3. tx 승인과 policy 승인은 동일한 보안 모델 (Unified SignedApproval).
4. Breaking change 적극 허용.

## Manifest — DeFi Tool 카탈로그

manifest 패키지(`packages/manifest/src/tools/`)는 DeFi 프로토콜별 tx + policy를 **한 묶음으로 빌드**하는 순수 함수를 제공한다.

```typescript
interface ToolCall {
  tx: { to: string; data: string; value: string }        // 실행할 트랜잭션
  policy: { type: 'call'; permissions: PermissionDict }   // 이 tx를 허용하는 정책
  description: string                                      // 사람이 읽을 설명
}
```

**모든 manifest tool은 동일한 `ToolCall` 반환**. tx와 policy는 분리 불가 — policy의 permissions가 정확히 이 tx의 selector + args를 허용하도록 생성된다.

**AI 사용 플로우**:
1. `erc20Transfer(token, to, amount)` → `{ tx, policy, description }` 반환
2. `policyRequest(policy)` → 사용자 승인 대기
3. 사용자 앱에서 승인 (Ed25519 서명)
4. `sendTransaction(tx)` → policy 평가 → ALLOW → 서명+전송

새 DeFi 프로토콜 추가 시 `manifest/src/tools/`에 함수 추가 → daemon tool-surface에 case 추가 → OpenClaw 플러그인에 등록.

## 설계 원칙

1. **Primitive First**: 가장 단순한 구현부터. 추상화는 반복이 증명된 후에.
2. **No Fallback**: 실패하면 실패. 조용히 우회하거나 대체 경로를 만들지 않는다.
3. **No Two-Way Implements**: 의존 방향은 단방향. A가 B를 알면 B는 A를 모른다.
4. **No Optional**: 선택적 필드/파라미터를 만들지 않는다. 필요하면 별도 타입으로 분리한다.
5. **DU over Optional**: 종류를 구분해야 할 때 optional 필드가 아니라 discriminated union을 쓴다. 분류가 필요하면 string 매칭이 아니라 enum/literal union을 쓴다. enum의 각 variant마다 공통 기능이 필요하지만 구현이 달라서 switch/if 분기가 산재하면, 추상화(strategy/visitor)로 분기를 제거한다.

## Relay 채널 아키텍처 (v0.4.8 확정)

### 핵심 원칙: Redis Streams = 단일 진실공급원 (Single Source of Truth)

**모든 영속 메시지(chat, control)는 Redis Stream만 거친다. 직접 WS forward 금지.**

v0.4.8 이전에는 직접 socket.send() + Redis XADD를 병행하여 이중 전달(메시지 중복)이 발생했다.
v0.4.8에서 직접 forward를 제거하고 Redis poller만을 유일한 전달 경로로 확정했다.

```
영속 채널 (chat, control):
  relay → Redis XADD → poller XREAD BLOCK → 소켓 전달 (단일 경로)

비영속 채널 (query, query_result):
  relay → WS 직접 전달 (Redis bypass, 의도적 예외)
```

### 채널 방향성 (v0.4.8 확정)

| 채널 | 방향 | 영속성 | 전달 방식 |
|------|------|--------|----------|
| `control` | App → Daemon | Redis Stream | poller (pollControlForDaemon) |
| `event_stream` | Daemon → App | Redis Stream | poller (pollControlForApp) |
| `chat` | 양방향 | Redis Stream | poller |
| `query` | App → Daemon | 비영속 | WS 직접 |
| `query_result` | Daemon → App | 비영속 | WS 직접 |

### XREAD BLOCK과 연결 관리

`XREAD BLOCK`은 새 메시지 도착 시 즉시 반환한다 (5초는 최대 대기, 아이들 타임아웃).
단, **하나의 Redis 연결은 한 번에 하나의 XREAD만 실행 가능**하므로,
여러 poller가 같은 blocking 연결을 공유하면 head-of-line blocking이 발생한다.
chat poller 추가 시 별도 blocking Redis 연결을 사용하거나,
단일 XREAD에 여러 stream을 합쳐야 한다.

### AI 호출 경로

Daemon → OpenClaw Gateway (`/v1/responses`, OpenResponses HTTP API) → LLM Provider
OpenClaw이 세션 히스토리, 모델 라우팅, 도구 실행을 관리한다.
Daemon은 OpenClaw을 우회하지 않는다.

## 기술 스택

- Guarded WDK: JS (ES Modules)
- Daemon: Node.js, OpenClaw Gateway (OpenResponses API)
- Relay: Node.js, Fastify, Redis Streams, PostgreSQL
- RN App: Expo, zustand, Expo SecureStore
- AI: OpenClaw Gateway → Anthropic Claude
