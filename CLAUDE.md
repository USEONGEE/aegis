# WDK-APP

AI DeFi Agent 서명 엔진 + 제어 인프라.

## 현재 페이즈

### v0.5.0 — Chat Poller 구현
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.5.0-chat-poller/](docs/phases/v0.5.0-chat-poller/)
- **시작일**: 2026-03-22

### v0.4.3 — Relay 타입 구조 정리
- **상태**: 개발 완료 (Codex 리뷰 통과, 커밋 대기)
- **문서**: [docs/phases/v0.4.3-relay-type-structure/](docs/phases/v0.4.3-relay-type-structure/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.4.3-relay-type-structure`
- **시작일**: 2026-03-22

### v0.4.5 — 크로스 패키지 Unknown 타입 체인 해소
- **상태**: 개발 완료 (커밋 대기)
- **문서**: [docs/phases/v0.4.5-unknown-type-chain/](docs/phases/v0.4.5-unknown-type-chain/)
- **시작일**: 2026-03-22

### v0.4.6 — Store 경계 분리 (WdkStore / DaemonStore)
- **상태**: Step 5 대기 (PRD+설계+DoD+티켓 완료)
- **문서**: [docs/phases/v0.4.6-store-boundary-separation/](docs/phases/v0.4.6-store-boundary-separation/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.4.6-store-boundary-separation`
- **시작일**: 2026-03-22

### v0.4.7 — Dead Exports 정리
- **상태**: 개발 완료 (Codex 리뷰 통과, 커밋 대기)
- **문서**: [docs/phases/v0.4.7-dead-exports-cleanup/](docs/phases/v0.4.7-dead-exports-cleanup/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.4.7-dead-exports-cleanup`
- **시작일**: 2026-03-22

### v0.4.0 — No Optional 원칙 전면 적용
- **상태**: Step 1 - PRD
- **문서**: [docs/phases/v0.4.0-no-optional-cleanup/](docs/phases/v0.4.0-no-optional-cleanup/)
- **Codex Session ID**: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.4.0-no-optional-cleanup`
- **시작일**: 2026-03-22

## 완료된 페이즈

모든 완료 문서는 [docs/archive/](docs/archive/)에 보관.

| 버전 | 이름 |
|---|---|
| v0.1.0 | WDK App Platform |
| v0.1.1 | Manifest Role Fix |
| v0.1.2 | TS Migration |
| v0.1.3 | CI Checks & Type Graph |
| v0.1.4 | Type Refactoring |
| v0.1.5 | Gap Resolution |
| v0.1.6 | Layer 0 Type Cleanup |
| v0.1.7 | Store 타입 네이밍 통일 |
| v0.1.8 | EvaluationResult 정책 컨텍스트 |
| v0.1.9 | Device → Signer 추상화 |
| v0.1.10 | Layer 0 Semantic Union |
| v0.2.0 | BIP-44 멀티 월렛 아키텍처 |
| v0.2.1 | Stored extends Input 타입 통일 |
| v0.2.2 | Policy Resolver |
| v0.2.3 | Manifest Type Dedup |
| v0.2.4 | WDK 외부 타입 직접 참조 |
| v0.2.5 | Decision 단순화 + 정책 버전 이력 |
| v0.2.6 | Daemon 타입 경계 정합성 복원 |
| v0.2.7 | signerId === publicKey 통합 |
| v0.2.8 | Manifest 정책 호환성 복원 |
| v0.2.9 | Daemon Wide-Bag Union 분리 |
| v0.2.10 | WDKContext 분해 + Port Interface |
| v0.2.11 | Daemon 타입 인프라 정리 |
| v0.3.0 | Relay Daemon Multiplex |
| v0.3.1 | App 채팅 UX 완성 |
| v0.3.2 | 프로토콜 타입 중복 제거 + 취소 API 분리 |
| v0.3.3 | Relay 오프라인 Cron 복구 통합 |
| v0.3.4 | Dead Code 정리 + Pairing 전면 제거 |
| v0.3.5 | Dead Exports CI 체크 포팅 |
| v0.3.6 | Daemon Self-Register |
| v0.4.0 | No Optional 원칙 전면 적용 |
| v0.4.1 | Strict CI Checks (no-empty-catch, no-console, no-explicit-any) |
| v0.4.2 | WDK 이벤트 단일화 + 타입 규격화 |
| v0.4.4 | App WDK 이벤트 마이그레이션 — sendApproval() 전환 + eventName→event.type + 이벤트 자동 소비 |
| v0.4.8 | WS 채널 재설계 + Protocol 타입 강제 적용 |
| v0.4.9 | 도메인 모델 Null 제거 |
| v0.5.1 | EVM Wallet Bootstrap |

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
5. **DU over Optional**: 종류를 구분해야 할 때 optional 필드가 아니라 discriminated union을 쓴다. 분류가 필요하면 string 매칭이 아니라 enum/literal union을 쓴다. enum의 각 variant마다 공통 기능이 필요하지만 구현이 달라서 switch/if 분기가 산재하면, 추상화(strategy/visitor)로 분기를 제거한다.

## 기술 스택

- Guarded WDK: JS (ES Modules)
- Daemon: Node.js, OpenAI SDK
- Relay: Node.js, Fastify, Redis Streams, PostgreSQL
- RN App: Expo, zustand, Expo SecureStore
- AI: OpenClaw (OpenAI 호환 API)
