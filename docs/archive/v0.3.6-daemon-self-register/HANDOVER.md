# 작업위임서 — Daemon Self-Register 구현

> daemon 첫 실행 시 relay에 자동 등록(self-register) 로직 추가. 설계 문서에 명시된 흐름이나 구현이 누락됨.

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 권한: daemon 패키지 수정

### What (무엇을)
- [ ] daemon 부팅 시 login 실패(401) → self-register → login 재시도 플로우 구현
- [ ] register 성공/실패 로깅
- [ ] 이미 등록된 daemon(409)은 정상으로 처리 (register skip → login 진행)

### When (언제)
- 선행 조건: v0.3.4 (dead code cleanup) 완료 후 권장. 단 독립 작업 가능
- 기한 없음

### Where (어디서)

| 파일 | 변경 |
|------|------|
| `packages/daemon/src/index.ts:144-186` | daemon bootstrap 블록에 register 로직 추가 |

### Why (왜)
- **설계 문서** (`docs/phases/v0.3.0-relay-daemon-multiplex/design.md:101-103`)에 명시:
  ```
  1. Daemon 첫 실행
     → POST /api/auth/daemon/register { daemonId, secret }
     → 201 { daemonId }
  2. Daemon 인증
     → POST /api/auth/daemon/login { daemonId, secret }
  ```
- **현재 코드**: login만 호출. register 없음. login 실패 시 에러 로그 + relay 연결 skip
- 안 하면: daemon을 처음 배포할 때 수동으로 `POST /auth/daemon/register`를 호출해야 함. 자동화된 배포 불가

### How (어떻게)
- `/codex-phase-workflow` v0.3.6
- 구현 방향:

```typescript
// index.ts — daemon bootstrap 블록 (현재 :144-186)
// 변경: login 실패 시 register → login 재시도

const loginRes = await fetch(`${relayHttpBase}/api/auth/daemon/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ daemonId: config.daemonId, secret: config.daemonSecret }),
})

if (!loginRes.ok) {
  // 401 = daemon이 relay에 없음 → self-register
  if (loginRes.status === 401) {
    logger.info({ daemonId: config.daemonId }, 'Daemon not registered, attempting self-register')
    const registerRes = await fetch(`${relayHttpBase}/api/auth/daemon/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemonId: config.daemonId, secret: config.daemonSecret }),
    })
    if (!registerRes.ok && registerRes.status !== 409) {
      throw new Error(`Daemon register failed: ${registerRes.status}`)
    }
    // 재시도 login
    const retryRes = await fetch(`${relayHttpBase}/api/auth/daemon/login`, { ... })
    if (!retryRes.ok) {
      throw new Error(`Daemon login failed after register: ${retryRes.status}`)
    }
    // retryRes에서 token 추출 후 진행
  } else {
    throw new Error(`Daemon login failed: ${loginRes.status}`)
  }
}
```

---

## 맥락

### 현재 상태
- 설계: v0.3.0 design.md에 self-register 플로우 명시
- 코드: login만 구현, register 호출 누락
- Relay API: `POST /auth/daemon/register` 엔드포인트는 이미 구현 완료 (auth.ts:370-393)

### 사용자 확정 결정사항
- daemon self-register 누락은 구현 갭이다 (설계대로 수정)
- v0.3.6으로 진행
- /codex-phase-workflow 사용

### 발견 경위
- daemon 아키텍처 분석(arch-one-pager) 세션에서 부트스트랩 플로우 설명 중 발견
- 처음에는 코드만 보고 "운영자가 수동 등록"이라고 잘못 설명
- 설계 문서 대조 후 구현 누락 확인

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| v0.3.0 설계 | `docs/phases/v0.3.0-relay-daemon-multiplex/design.md` | self-register 플로우 명세 (:101-103) |
| Relay auth API | `packages/relay/src/routes/auth.ts:370-393` | register 엔드포인트 구현 확인 |
| Daemon bootstrap | `packages/daemon/src/index.ts:144-186` | 현재 코드 (login only) |
| Daemon 도메인 분석 | `docs/report/daemon-domain-aggregate-analysis.md` | 전체 아키텍처 맥락 |

---

## 주의사항
- register 409 (이미 등록됨)는 에러가 아님. skip하고 login 진행
- Relay의 register API는 secret을 hashPassword()로 해싱해서 저장. daemon이 매번 같은 secret을 보내야 login 성공
- v0.3.4 (dead code cleanup)과 파일 충돌 가능성 낮음 (index.ts의 다른 영역)

## 시작 방법
```
/codex-phase-workflow v0.3.6-daemon-self-register
```
