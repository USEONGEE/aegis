# WDK-APP Platform - v0.1.0

## 문제 정의

### 현상
- Guarded WDK v0.0.1이 완료되었지만 (policy 평가 + 이벤트, 43 테스트), 이는 순수 라이브러리에 불과함
- AI agent가 Guarded WDK를 사용하려면 다음이 전부 없음:
  - AI ↔ WDK 연결 인터페이스
  - 서명 기반 승인 보안 (현재 InMemoryApprovalBroker는 누구나 grant 가능 — AI가 자가 승인 가능)
  - Policy 영속 저장 (in-memory only, daemon 재시작 시 유실)
  - 다중 seed 관리
  - owner의 원격 제어 (모바일 앱)
  - NAT/방화벽 뒤 개인 서버 접근을 위한 메시지 중계 인프라
  - 중복 온체인 실행 방지 (재연결/retry 시 같은 tx가 두 번 broadcast될 수 있음)
  - 오프라인/재연결 시 메시지 유실 방지
  - 주기 작업 (cron) 관리

### 원인
- Guarded WDK는 의도적으로 "서명 엔진"으로만 설계됨 — 인프라는 범위 밖이었음
- InMemoryApprovalBroker는 흐름 검증용 PoC — 서명 기반 보안 미구현
- 실제 사용 시나리오 (AI agent + 모바일 owner + 개인 서버)를 위한 전체 스택이 필요

### 영향
- Guarded WDK를 실제 제품으로 사용할 수 없음
- AI가 승인 없이 policy를 자가 적용할 수 있어 보안 모델이 무의미
- owner가 원격에서 승인/정책 관리를 할 수 없음
- daemon 재시작 시 모든 policy가 유실됨
- 개인 서버가 NAT 뒤에 있으면 모바일 앱에서 접근 불가
- 재연결/retry 시 중복 tx broadcast 위험
- 승인 요청/응답 유실 시 owner action miss 또는 세션 불일치 발생
- 주기적 감시 (health factor 등) 불가

### 목표

이 Phase가 완료되면 다음 상태가 달성됨:

**보안 불변식 (제품 요구)**
1. **AI는 policy/tx를 승인할 수 없다** — identity key가 owner 폰(Expo SecureStore)에만 있음
2. **owner의 identity key가 모든 승인의 루트다** — tx, policy, device 작업 모두 동일한 Unified SignedApproval 모델
3. **Relay는 payload를 볼 수 없다** — E2E 암호화, Relay는 라우팅 metadata만 평문
4. **중복 온체인 실행이 0건이다** — Execution Journal (intentId dedupe), retry/reconnect 포함

**기능 목표 (검증 가능한 상태)**
5. owner가 폰에서 tx/policy/device 작업을 승인/거부할 수 있다
6. AI가 daemon-managed function calling으로 WDK tool을 호출하여 DeFi tx를 서명/제출할 수 있다
7. daemon 재시작 후 signed policy + pending state + approval history가 유지된다
8. 개인 서버가 NAT/방화벽 뒤에 있어도 outbound WebSocket으로 Relay에 연결하여 동작한다
9. AI가 주기 작업(cron)을 등록하고 daemon이 자동 실행할 수 있다
10. Manifest → policy 자동 변환이 가능하다

### 비목표 (Out of Scope)
- 자체 AI agent 개발 (OpenClaw 사용)
- 자체 DeFi 로직 (별도 CLI가 담당, Phase 1은 AI가 raw calldata 직접 구성)
- 멀티 유저 / 팀 관리
- 온체인 policy
- seed 암호화 (Phase 1은 DB에 평문, Phase 2에서 WDK Secret Manager)
- 멀티체인 구현 (Phase 1은 EVM only, 설계는 멀티체인)
- AI의 OS 레벨 탈출 방어 (Phase 2 컨테이너 격리)
- DeFi helper tool (Phase 2에서 `aaveRepay`, `uniswapSwap` 등 convenience tool)
- OpenClaw direct CLI/MCP 모드 (Phase 1은 daemon-managed function calling만)

## 제약사항
- 기존 Guarded WDK 코어 (guarded-middleware.js의 evaluatePolicy)는 최소 변경
- InMemoryApprovalBroker → SignedApprovalBroker breaking change 허용
- 모노레포 구조 (`packages/guarded-wdk`, `daemon`, `relay`, `app`, `manifest`)
- **OpenClaw 통합 모델**: daemon-managed function calling이 정식 모델. daemon이 OpenAI SDK로 OpenClaw API(localhost:18789)에 tool을 등록하고, tool_call을 수신하여 WDK를 직접 호출. `docs/openclaw-api-spec.md`의 CLI/MCP 직접 등록 예시는 참고용이며 Phase 1에서는 사용하지 않음.
- RN App은 HypurrQuant 추상화 패턴 차용 (인터페이스, 상태머신, 어댑터, Zustand) — Rust/Keychain 대신 WDK가 서명 백엔드

## 참조 문서
- **확정 PRD**: `docs/PRD.md` (Codex 4차 리뷰 통과)
- **인수인계**: `docs/HANDOVER.md`
- **OpenClaw API**: `docs/openclaw-api-spec.md` (참고용 — Phase 1 정식 모델은 daemon-managed function calling)
- **아키텍처 리포트**: `docs/report/architecture-and-user-flow-summary.md`
- **Guarded WDK v0.0.1 설계**: `packages/guarded-wdk/docs/phases/v0.0.1-guarded-wdk/`
