# Aegis 시스템 아키텍처 One-Pager

> AI agent의 온체인 실행 요청을 정책으로 판정하고, owner의 Ed25519 서명으로 인가하며, Relay를 통해 모바일과 실시간 통신하는 정책 기반 AI 실행 엔진

---

## Section 1 — 전체 구조

```
  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │  DeFi Protocols                                                   │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
  │  │ Uniswap  │ │  Aave    │ │ Compound │ │   ...    │             │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘             │
  │       │            │            │            │                    │
  │       └────────────┴─────┬──────┴────────────┘                    │
  │                          │                                        │
  │                    Manifest (JSON)                                 │
  │                 "프로토콜이 자신의 기능을                            │
  │                  선언하는 표준 인터페이스"                            │
  │                          │                                        │
  └──────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                         Daemon                                    │
  │                    (오케스트레이션 호스트)                           │
  │                                                                   │
  │   ┌─────────────┐    tool call    ┌──────────────────────────┐   │
  │   │             │ ──────────────→ │      GuardedWDK          │   │
  │   │  AI Agent   │                 │    (서명 엔진)             │   │
  │   │ (OpenClaw)  │                 │                          │   │
  │   │             │ ← 결과/에러 ──  │  ┌────────────────────┐  │   │
  │   │ 12개 도구만  │                 │  │   Policy Engine    │  │   │
  │   │ 사용 가능    │                 │  │                    │  │   │
  │   └─────────────┘                 │  │ Manifest → Policy  │  │   │
  │                                   │  │ Policy → 평가      │  │   │
  │                                   │  │ 위반 → 서명 거부    │  │   │
  │                                   │  └────────────────────┘  │   │
  │                                   │                          │   │
  │                                   │  ┌────────────────────┐  │   │
  │                                   │  │ Approval Verifier  │  │   │
  │                                   │  │ (6단계 서명 검증)    │  │   │
  │                                   │  └────────────────────┘  │   │
  │                                   │                          │   │
  │                                   │  ┌────────────────────┐  │   │
  │                                   │  │ Execution Journal  │  │   │
  │                                   │  │ (중복 실행 방지)     │  │   │
  │                                   │  └────────────────────┘  │   │
  │                                   └──────────────────────────┘   │
  │                                                                   │
  └──────────────────────────────┬────────────────────────────────────┘
                                 │
                          WebSocket (outbound)
                          E2E 암호화
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                          Relay                                    │
  │                    (블라인드 메시지 버스)                            │
  │                                                                   │
  │   - JWT 인증만 처리                                                │
  │   - 메시지 payload 복호화 불가 (E2E)                                │
  │   - Redis Streams로 메시지 영속                                    │
  │   - 연결 끊김 시 커서 기반 복구                                     │
  │                                                                   │
  └──────────────────────────────┬────────────────────────────────────┘
                                 │
                          WebSocket (outbound)
                          E2E 암호화
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                        Mobile App                                 │
  │                      (Owner 제어판)                                │
  │                                                                   │
  │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │   │   Chat   │ │ Approval │ │  Policy  │ │ Activity │           │
  │   │  AI와    │ │  승인     │ │  정책    │ │  실행    │            │
  │   │  대화    │ │  요청     │ │  관리    │ │  이력    │            │
  │   └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
  │                                                                   │
  │   Ed25519 Identity Key (Expo SecureStore, 디바이스 밖으로 나가지 않음) │
  │                                                                   │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Section 2 — 핵심 도메인

### 1. 정책 (Policy)

> "AI의 온체인 호출이 허용된 범위 안인지 판정하는 규칙 체계"

```
  Manifest (JSON) ──→ manifestToPolicy() ──→ Policy
                                              │
  Transaction ──→ evaluatePolicy() ──→ Decision
                                        │
                                  ALLOW → 즉시 서명+실행
                                  REJECT → 서명 거부, 승인 요청
```

- **Manifest**: DeFi 프로토콜이 제공하는 JSON 선언서. 어떤 컨트랙트의 어떤 함수를 호출할 수 있는지 정의
- **Policy**: Manifest에서 자동 생성된 허용 규칙. target(컨트랙트) + selector(함수) + args(인자 조건)
- **Decision**: ALLOW 또는 REJECT. 중간은 없음

### 2. 승인 (Approval)

> "정책 밖의 행위에 대해 owner가 Ed25519로 서명하는 인가 토큰"

```
  ApprovalRequest ──→ Owner 확인 ──→ Ed25519 서명 ──→ SignedApproval
                                                        │
                                                   6단계 검증:
                                                   1. 신뢰된 승인자?
                                                   2. 해지되지 않았나?
                                                   3. 서명 유효?
                                                   4. 만료 안 됐나?
                                                   5. nonce 재사용 아닌가?
                                                   6. 타입별 추가 검증
```

- tx 승인, 정책 승인, 디바이스 해지, 월렛 생성 — **모두 동일한 서명 모델**

### 3. AI 실행 (Execution)

> "AI agent가 12개 제한된 도구로 온체인 작업을 수행하는 실행 계층"

```
  AI Agent ──→ tool_call ──→ Daemon ──→ GuardedWDK
                                          │
                              Policy 평가 + Journal 중복 체크
                                          │
                                    서명 or 거부
```

- AI는 seed 접근, 정책 수정, 서명 우회 **불가**
- 12개 도구: sendTransaction, transfer, getBalance, policyList, policyRequest, registerCron 등

### 4. 중계 (Transport)

> "Daemon과 App 사이의 E2E 암호화 메시지를 라우팅하는 블라인드 버스"

```
  Daemon ←──→ Relay ←──→ App
           │         │
     Redis Streams  WebSocket
     (영속, 복구)   (실시간)
```

- Relay는 payload를 **복호화할 수 없음** — 라우팅만 담당
- 오프라인 복구: 커서 기반 재전송

---

## Section 3 — 도메인 관계

```
  ┌──────────────────────┐
  │ DeFi Protocol        │
  │ (외부)                │
  └──────────┬───────────┘
             │ Manifest 제공
             ▼
  ┌──────────────────────┐         ┌──────────────────────┐
  │      Policy          │         │     Transport        │
  │  정책 평가 + 생성     │         │   E2E 메시지 중계     │
  └──────────┬───────────┘         └──────┬──────┬────────┘
             │                            │      │
             │ REJECT 시                   │      │
             │ 승인 요청 생성               │      │
             ▼                            │      │
  ┌──────────────────────┐                │      │
  │     Approval         │ ◄──────────────┘      │
  │  서명 검증 + 인가     │   승인 요청/응답 전달     │
  └──────────┬───────────┘                       │
             │                                   │
             │ 검증 완료 시 실행                    │
             ▼                                   │
  ┌──────────────────────┐                       │
  │    Execution         │                       │
  │  AI 도구 실행         │ ──────────────────────┘
  └──────────────────────┘   실행 결과 이벤트 전송
```

| 관계 | 설명 |
|------|------|
| Protocol → Policy | Manifest가 Policy로 변환되어 AI의 허용 범위 정의 |
| Policy → Approval | 정책 밖 요청 시 승인 요청 생성 → 모바일로 전송 |
| Approval → Execution | 6단계 검증 통과 시 도메인 작업 실행 |
| Execution → Transport | 실행 결과를 이벤트로 App에 실시간 전송 |
| Transport → Approval | 승인 요청/응답을 App ↔ Daemon 양방향 전달 |

---

## Section 4 — 기능 축

```
                        3개의 기능 축:

  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
  │  1. 자율 실행       │  │  2. 통제된 확장     │  │  3. 실시간 제어     │
  │ "정책 안에서 AI가   │  │ "새 프로토콜이      │  │ "Owner가 모바일에서 │
  │  자율적으로 실행"   │  │  어떻게 붙는가?"    │  │  모든 것을 관리"    │
  │ [Policy+Execution] │  │ [Manifest+Policy]  │  │ [Approval+Transport│
  │                    │  │                    │  │  +App]             │
  └────────┬───────────┘  └────────┬───────────┘  └────────┬───────────┘
           │                       │                       │
           ▼                       ▼                       ▼
     ALLOW → 즉시 실행       JSON 하나로 연결         서명/거부/감시
```

---

## Section 5 — 축별 상세

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  축 1. 자율 실행 (Autonomous Execution)                             ┃
┃  ─────────────────────────                                        ┃
┃  "정책 범위 안의 트랜잭션을 AI가 사람 개입 없이 실행하는가?"           ┃
┃  관여 도메인: Policy, Execution, Approval                          ┃
┃                                                                    ┃
┃  AI: "Swap 100 USDC to ETH"                                       ┃
┃    │                                                               ┃
┃    ▼                                                               ┃
┃  Journal: isDuplicate? ──→ 중복이면 거부                             ┃
┃    │                                                               ┃
┃    ▼ (신규)                                                        ┃
┃  Policy Engine: evaluatePolicy(tx)                                 ┃
┃    │                                                               ┃
┃    ├─ ALLOW (정책 범위 안)                                          ┃
┃    │    → WDK 서명 → 온체인 브로드캐스트 → 완료                      ┃
┃    │    → 사람 개입 없음. 완전 자율.                                  ┃
┃    │                                                               ┃
┃    └─ REJECT (정책 범위 밖)                                         ┃
┃         → ApprovalRequest 생성 → Relay → 모바일                     ┃
┃         → Owner 서명 → 6단계 검증 → 실행                             ┃
┃         → 또는 Owner 거부 → AI에게 통보                              ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  축 2. 통제된 확장 (Controlled Extension)                           ┃
┃  ─────────────────────────────                                    ┃
┃  "새로운 DeFi 프로토콜을 코드 변경 없이 어떻게 연결하는가?"           ┃
┃  관여 도메인: Manifest, Policy                                     ┃
┃                                                                    ┃
┃  DeFi Protocol                                                     ┃
┃    │                                                               ┃
┃    │ Manifest (JSON 선언서)                                         ┃
┃    │  ┌──────────────────────────────────────┐                      ┃
┃    │  │ protocol: "uniswap-v2"               │                     ┃
┃    │  │ features:                            │                     ┃
┃    │  │   - addLiquidity                     │                     ┃
┃    │  │     calls: [router.addLiquidity()]   │                     ┃
┃    │  │     approvals: [tokenA→router,       │                     ┃
┃    │  │                  tokenB→router]      │                     ┃
┃    │  │   - removeLiquidity                  │                     ┃
┃    │  │     calls: [router.removeLiquidity()]│                     ┃
┃    │  └──────────────────────────────────────┘                      ┃
┃    │                                                               ┃
┃    ▼                                                               ┃
┃  manifestToPolicy() ──→ Policy 자동 생성                            ┃
┃    │                                                               ┃
┃    ▼                                                               ┃
┃  Owner 승인 ──→ Policy 활성화 ──→ AI가 해당 프로토콜 사용 가능        ┃
┃                                                                    ┃
┃  코드 변경: 0줄. AI 재학습: 불필요.                                  ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                                    ┃
┃  축 3. 실시간 제어 (Real-time Control)                              ┃
┃  ─────────────────────────────                                    ┃
┃  "Owner가 모바일에서 AI의 활동을 실시간으로 감시하고 제어하는가?"      ┃
┃  관여 도메인: Approval, Transport, App                              ┃
┃                                                                    ┃
┃  Daemon ──→ Relay (블라인드) ──→ Mobile App                         ┃
┃           E2E 암호화              │                                ┃
┃           Redis 영속              ├─ 승인 요청 → 서명 or 거부        ┃
┃           커서 기반 복구          ├─ AI 대화 → 실시간 스트리밍        ┃
┃                                  ├─ 실행 이벤트 → 타임라인           ┃
┃                                  └─ 정책 관리 → 승인/거부            ┃
┃                                                                    ┃
┃  보안 경계:                                                         ┃
┃    - Relay는 payload 복호화 불가 (라우팅만)                          ┃
┃    - Identity Key는 디바이스 밖으로 나가지 않음 (SecureStore)         ┃
┃    - Daemon은 NAT 뒤에서 outbound WebSocket만 사용                  ┃
┃                                                                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
```

---

## Section 6 — 데모 시나리오

```
               4개 시나리오의 흐름:

  [시나리오 1]         [시나리오 2]         [시나리오 3]         [시나리오 4]
  정책 없이 송금   →   정책 만들고 송금  →   DEX LP 추가     →   LP 절반 축소
  "승인이 필요하다"    "자율로 실행된다"    "프로토콜이 붙는다"   "AI가 자율 판단"

  ──────────────── 신뢰가 점진적으로 쌓이는 스토리 ────────────────
```

### 시나리오 1: 정책 없는 송금 — "승인이 필요하다"

```
  사용자: "Alice에게 100 USDC 보내줘"
    → [축1] AI가 transfer 호출 시도
    → Policy Engine: 해당 정책 없음 → REJECT
    → ApprovalRequest 생성 → Relay → 모바일
    → [축3] Owner가 내용 확인 → Ed25519 서명 → Approve
    → Daemon: 6단계 검증 통과 → WDK 서명 → 온체인 전송
    → 결과 이벤트 → 모바일 타임라인에 표시
```

### 시나리오 2: 정책 있는 송금 — "자율로 실행된다"

```
  사용자: "Alice에게 100 USDC 보내줘"
    → [축1] AI가 transfer 호출
    → Policy Engine: 정책 확인
      - target: USDC ✓
      - selector: transfer ✓
      - arg[0] Alice: ONE_OF [Alice, Bob, Treasury] ✓
      - arg[1] 100 USDC: LTE 1000 USDC ✓
    → ALLOW → WDK 즉시 서명 → 온체인 전송
    → 사람 개입 없음. 완전 자율.
```

### 시나리오 3: DEX LP 추가 — "프로토콜이 붙는다"

```
  [축2] Uniswap V2 Manifest 등록
    → manifestToPolicy() → LP 관련 Policy 자동 생성
      - addLiquidity(tokenA, tokenB, amount, ...)
      - removeLiquidity(tokenA, tokenB, liquidity, ...)
      - approve(tokenA → router)
      - approve(tokenB → router)
    → Owner에게 정책 승인 요청 → 모바일에서 확인 → 서명

  사용자: "USDC/ETH 풀에 1000 USDC 규모로 LP 추가해줘"
    → [축1] AI가 3개 call 순차 실행 (모두 정책 범위 안)
      1. approve(USDC, router) → ALLOW → 즉시 실행
      2. approve(WETH, router) → ALLOW → 즉시 실행
      3. addLiquidity(USDC, WETH, amount, ...) → ALLOW → 즉시 실행
    → LP 포지션 생성 완료. 전부 자율.
```

### 시나리오 4: LP 포지션 축소 — "AI가 자율 판단한다"

```
  사용자: "LP 포지션을 절반으로 줄여줘"
    → [축1] AI가 현재 LP 잔고 조회 → 절반 계산
    → removeLiquidity(USDC, WETH, liquidity/2, ...)
    → Policy Engine: removeLiquidity는 시나리오 3에서 이미 승인됨
    → ALLOW → 즉시 실행
    → 사람 개입 없음. AI가 판단하고 자율 실행.
```

---

**작성일**: 2026-03-22 KST
