# WDK-APP

AI DeFi Agent 서명 엔진 + 제어 인프라.

## 현재 페이즈

### v0.1.7 — Store 타입 네이밍 통일
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.1.7-store-naming/](docs/phases/v0.1.7-store-naming/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.1.7-store-naming`
- **시작일**: 2026-03-19

### v0.1.8 — EvaluationResult 정책 컨텍스트 추가
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.1.8-evaluation-context/](docs/phases/v0.1.8-evaluation-context/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.1.8-evaluation-context`
- **시작일**: 2026-03-19

### v0.1.9 — Device → Signer 추상화
- **상태**: Step 5 완료 (커밋 대기)
- **문서**: [docs/phases/v0.1.9-signer-abstraction/](docs/phases/v0.1.9-signer-abstraction/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.1.9-signer-abstraction`
- **시작일**: 2026-03-19

### v0.1.10 — Layer 0 Semantic Union 도입
- **상태**: Step 5 완료 (커밋 대기)
- **문서**: [docs/phases/v0.1.10-semantic-unions/](docs/phases/v0.1.10-semantic-unions/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.1.10-semantic-unions`
- **시작일**: 2026-03-19

### v0.2.0 — BIP-44 멀티 월렛 아키텍처
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.2.0-bip44-wallet/](docs/phases/v0.2.0-bip44-wallet/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.2.0-bip44-wallet`
- **시작일**: 2026-03-19

### v0.2.1 — Stored extends Input 타입 통일
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.2.1-stored-extends-input/](docs/phases/v0.2.1-stored-extends-input/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.2.1-stored-extends-input`
- **시작일**: 2026-03-20

### v0.2.4 — WDK 외부 타입 직접 참조
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.2.4-wdk-type-safety/](docs/phases/v0.2.4-wdk-type-safety/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.2.4-wdk-type-safety`
- **시작일**: 2026-03-20

### v0.2.5 — Decision 단순화 + 정책 버전 이력
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.2.5-decision-simplification/](docs/phases/v0.2.5-decision-simplification/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.2.5-decision-simplification`
- **시작일**: 2026-03-20

## 프로젝트 구조

```
packages/
  guarded-wdk/   ← 서명 엔진 (@tetherto/wdk 포크)
  manifest/      ← policy 카탈로그
  daemon/        ← orchestration host
  relay/         ← Relay Server
  app/           ← RN App (Expo)
```

## 핵심 원칙

1. WDK = 서명 엔진. DeFi 로직은 별도 CLI.
2. AI는 policy를 요청할 수 있지만, 승인할 수 없다.
3. tx 승인과 policy 승인은 동일한 보안 모델 (Unified SignedApproval).
4. Breaking change 적극 허용.

## 설계 원칙

1. **Primitive First**: 가장 단순한 구현부터. 추상화는 반복이 증명된 후에.
2. **No Fallback**: 실패하면 실패. 조용히 우회하거나 대체 경로를 만들지 않는다.
3. **No Two-Way Implements**: 의존 방향은 단방향. A가 B를 알면 B는 A를 모른다.
4. **No Optional**: 선택적 필드/파라미터를 만들지 않는다. 필요하면 별도 타입으로 분리한다.

## 기술 스택

- Guarded WDK: JS (ES Modules)
- Daemon: Node.js, OpenAI SDK
- Relay: Node.js, Fastify, Redis Streams, PostgreSQL
- RN App: Expo, zustand, Expo SecureStore
- AI: OpenClaw (OpenAI 호환 API)
