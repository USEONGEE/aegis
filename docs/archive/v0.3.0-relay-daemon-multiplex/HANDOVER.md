# 작업위임서 — v0.3.0 PRD 확장: 부트스트랩 인증 통합

> v0.3.0 PRD에 Daemon 부트스트랩 인증(Device Enrollment + App 승인) 스코프를 추가하고, Step 2(Design)로 진행

---

## 6하원칙

### Who (누가)
- v0.3.0 Phase 작업자 (다음 세션)
- 필요 접근: packages/relay, packages/daemon, packages/app

### What (무엇을)
- [ ] v0.3.0 README.md PRD 확장 — 아래 "부트스트랩 인증" 스코프를 기존 PRD에 통합
- [ ] Step 1 PRD 완료 처리 → Codex 리뷰
- [ ] Step 2 Design 진행 (프로토콜 스펙 확정)

### When (언제)
- 즉시 가능 (선행 조건 없음)
- v0.3.1 (App Chat UX)과 독립 — 병렬 진행 가능

### Where (어디서)
- PRD: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.3.0-relay-daemon-multiplex/README.md`
- Relay auth: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/relay/src/routes/auth.ts`
- Relay WS: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/relay/src/routes/ws.ts`
- Daemon config: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/daemon/src/config.ts`
- Daemon relay-client: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/daemon/src/relay-client.ts`
- App RelayClient: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/app/src/core/relay/RelayClient.ts`
- App PairingService: `/Users/mousebook/Documents/GitHub/WDK-APP/packages/app/src/core/crypto/PairingService.ts`

### Why (왜)

현재 Daemon↔Relay 연결의 부트스트랩이 완전히 수동이다:

1. **수동 토큰 설정**: curl로 register → JWT 복사 → Daemon env에 붙여넣기 → Daemon 시작
2. **토큰 갱신 불가**: JWT 7일 만료 후 Daemon이 자체 재인증 수단 없음
3. **인증 성공 확인 누락**: App/Daemon 모두 WS `open` 이벤트만으로 연결 성공 처리. `authenticated` 응답을 기다리지 않음 → 토큰 만료 시 "연결된 것처럼 보이지만 인증 안 된 상태"
4. **Pairing 미완성**: `PairingService`가 auth token 없이 연결 시도하는데 Relay는 토큰 요구 → 실제로 동작하지 않는 코드

v0.3.0이 이미 "daemon 자체 인증"을 목표로 잡고 있으므로, 부트스트랩 인증을 여기에 통합하는 것이 자연스럽다.

### How (어떻게)

워크플로우: `/codex-phase-workflow` (기존 v0.3.0 세션 이어서)

---

## 맥락

### 현재 상태
- v0.3.0: Step 1 (PRD) 진행중
- Codex Session ID: `/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.3.0-relay-daemon-multiplex`

### 사용자 확정 결정사항

#### 1. 부트스트랩 인증 방식: Device Enrollment + App 승인 Flow

"Google OAuth + token 복사" 방식은 기각. 이유:
- UX: 웹 로그인 → 복사 → SSH/터미널 → env 수정 → daemon 재시작 — 컨텍스트 전환 과다
- 보안: bearer token이 clipboard/shell history에 노출
- 권한: "daemon 전용 credential"이 아니라 "user 전체 권한"이라 권한 분리 안 됨

**확정된 흐름:**

```
1. 사용자: App에서 Google OAuth (PKCE)로 로그인

2. Daemon 첫 실행:
   → Relay에 enrollment 요청
   → QR 코드 또는 device code를 터미널에 표시

3. 사용자: 이미 로그인된 App으로 QR 스캔
   → "이 Daemon을 내 계정에 연결" 승인만 탭

4. Relay:
   → daemon_id + refresh credential 발급
   → Daemon은 이걸로 access JWT 자동 갱신 (수동 개입 X)

5. 이후:
   → Daemon은 자동으로 토큰 갱신하며 영구 연결
   → revoke 시에만 다시 QR 띄워서 relink
```

#### 2. JWT 역할 분리

| 토큰 | sub | role | 추가 claim |
|------|-----|------|-----------|
| App용 | userId | `app` | deviceId |
| Daemon용 | daemonId | `daemon` | daemonId |

- 현재: 둘 다 `{ sub: userId }` 동일 토큰 → 역할 구분 불가
- 변경: role claim으로 구분 + daemon은 자체 identity

#### 3. QR/SAS 페어링 역할 분리

- **Relay 인증**: Device Enrollment Flow가 담당 (위 흐름)
- **E2E 암호화**: 기존 QR/SAS 페어링은 App↔Daemon E2E 신뢰 수립 용도로만 유지
- 두 관심사를 혼합하지 않음

#### 4. v0.3.0 스코프 확장 (기존 + 추가)

```
v0.3.0 스코프
├── [기존] daemon 엔티티 도입 + daemon_users 매핑
├── [기존] 단일 WS 멀티플렉싱 (1 daemon : N users)
├── [기존] daemon 자체 인증 (daemon 토큰)
├── [추가] App Google OAuth (PKCE) 로그인
├── [추가] Device Enrollment Flow (Daemon 등록)
├── [추가] Refresh token 기반 자동 갱신
└── [추가] WS 인증 성공 확인 로직 수정
```

#### 5. v0.3.0과 v0.3.1 관계

- 완전 독립. 병렬 진행 가능.
- v0.3.0: Relay + Daemon (백엔드 인프라)
- v0.3.1: App Chat UX (프론트엔드)
- 유일한 접점: v0.3.0에서 WS 프로토콜 변경 시 App RelayClient 메시지 파싱 부분 조정 필요 → v0.3.0 Design 확정 후 v0.3.1이 그 스펙을 따르면 됨

### Codex 분석 요약 (코드 기반)

Codex가 코드를 직접 읽고 발견한 추가 사항:
- `packages/relay/src/routes/ws.ts#L121`: 인증 실패 시 에러만 보내고 소켓을 닫지 않음
- `packages/daemon/src/relay-client.ts#L244`: WS `open`만으로 연결 성공 처리, `authenticated` 응답 미대기
- `packages/app/src/core/relay/RelayClient.ts#L143`: 동일 문제
- `packages/app/src/core/crypto/PairingService.ts#L120`: auth token 없이 Relay 연결 시도 — 실제 동작 불가
- `packages/daemon/src/index.ts#L63`: pairing session이 항상 `null`

### 참조 문서

| 문서 | 경로 | 용도 |
|------|------|------|
| v0.3.0 PRD | `docs/phases/v0.3.0-relay-daemon-multiplex/README.md` | 기존 멀티플렉스 PRD |
| v0.3.0 진행 | `docs/phases/v0.3.0-relay-daemon-multiplex/PROGRESS.md` | Phase 진행 상황 |
| v0.3.1 PRD | `docs/phases/v0.3.1-app-chat-ux/README.md` | 독립 병렬 작업 참조 |
| Relay auth | `packages/relay/src/routes/auth.ts` | 현재 인증 구현 |
| Relay WS | `packages/relay/src/routes/ws.ts` | 현재 WS 핸들러 |

---

## 주의사항

- PRD에 부트스트랩 스코프를 추가할 때, 기존 멀티플렉스 목표와 자연스럽게 통합할 것 (별도 섹션이 아니라 목표/영향/범위에 녹여야 함)
- "Google OAuth + token 복사" 방식은 사용자가 명시적으로 기각함 — 대안으로 제시하지 말 것
- App 인증 모델 변경이 비목표(Out of Scope)에 있었으나, Google OAuth 도입으로 App 로그인도 변경됨 → 비목표 항목 수정 필요
- Codex가 발견한 기존 코드 버그(인증 확인 누락, pairing 미완성)도 PRD 현상/영향에 반영할 것

## 시작 방법

```
# v0.3.0 Phase 이어서
/codex-phase-workflow

# Codex Session ID (기존 세션 이어서)
/Users/mousebook/Documents/GitHub/WDK-APP/docs/phases/v0.3.0-relay-daemon-multiplex

# 할 일:
# 1. 이 HANDOVER.md의 결정사항을 README.md PRD에 통합
# 2. Step 1 PRD Codex 리뷰 통과
# 3. Step 2 Design 진행
```
