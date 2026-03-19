# WDK-APP

AI DeFi Agent 서명 엔진 + 제어 인프라.

## 현재 페이즈

- **버전**: v0.1.6 완료
- **기능**: Layer 0 타입 정리 (@internal 누수 제거, No Optional 적용)
- **상태**: Complete
- **문서**: [docs/archive/v0.1.6-layer0-type-cleanup/](docs/archive/v0.1.6-layer0-type-cleanup/)
- **완료일**: 2026-03-19

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
