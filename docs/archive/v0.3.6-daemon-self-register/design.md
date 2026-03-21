# 설계 - v0.3.6

## 변경 규모
**규모**: 작은 변경
**근거**: daemon 패키지 내 기존 bootstrap 블록에서 auth 로직을 함수로 추출 + 조건 분기 추가. 기존 패턴(fetch + 상태 코드 분기) 그대로 적용. API/스키마 변경 없음.

---

## 문제 요약
daemon bootstrap 시 login만 호출하고 register가 누락됨. 미등록 daemon은 401로 실패하여 relay 연결이 전면 중단됨.

> 상세: [README.md](README.md) 참조

## 접근법
1. 기존 `main()` 인라인 auth 로직을 `authenticateWithRelay()` 함수로 추출
2. 해당 함수 내에서 login → 401 분기 → register → login 재시도 플로우 구현
3. `main()`에서는 추출된 함수를 호출

**변경 전:**
```
main() 내 인라인: login → 실패 시 throw
```

**변경 후:**
```
authenticateWithRelay(relayHttpBase, daemonId, daemonSecret, logger): Promise<string>
  login → 200: token 반환
       → 401: register 시도
                → 201: 등록 성공 → login 재시도
                → 409: 이미 등록 → login 재시도
                → 그 외: throw
              login 재시도
                → 200: token 반환
                → 그 외: throw
       → 그 외: throw
```

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: login 전 무조건 register 시도 | 단순 — 항상 register 먼저 | 매번 불필요한 API 호출 (이미 등록된 daemon도 409 발생) | ❌ |
| B: login 실패(401) 시 register → login 재시도 (함수 추출) | 정상 경로에서 추가 호출 없음. 설계 문서 흐름과 일치. 함수 분리로 테스트 가능 | A보다 분기 로직이 복잡 | ✅ |
| C: main() 인라인으로 분기만 추가 | 최소 변경 | main()이 더 비대해짐. fetch 모킹 없이 테스트 불가 | ❌ |

**선택 이유**: B — 정상 경로에서 추가 네트워크 호출이 없고, 함수 추출로 기존 daemon 테스트 패턴(함수 단위 테스트)과 일치하며, 3가지 시나리오를 독립적으로 검증 가능.

## 기술 결정
- `authenticateWithRelay(relayHttpBase, daemonId, daemonSecret, logger)` 함수를 `packages/daemon/src/relay-auth.ts`로 분리. 이유: `index.ts`는 import 시 `main()`이 즉시 실행되므로(`index.ts:271`) 동일 파일에 두면 테스트 import가 daemon 부팅을 트리거함
- 기존 `fetch()` 패턴 그대로 사용 (node built-in fetch)
- register 응답 body는 사용하지 않음 (`{ daemonId }` — 이미 알고 있는 값)
- 반환값: JWT token string

### 로깅 설계

| 시나리오 | 로그 레벨 | 메시지 |
|---------|----------|--------|
| login 성공 (기존 daemon) | `info` | `Daemon authenticated with relay` |
| login 401 → register 시도 | `info` | `Daemon not registered, attempting self-register` |
| register 201 (등록 성공) | `info` | `Daemon self-registered successfully` |
| register 409 (이미 등록) | `info` | `Daemon already registered, retrying login` |
| login 재시도 성공 | `info` | `Daemon authenticated with relay` |
| login 재시도 실패 (잘못된 secret) | `error` | `Daemon login failed after register (likely wrong DAEMON_SECRET)` |
| register 실패 (5xx 등) | `error` | `Daemon self-register failed: {status}` |
| login 실패 (비-401) | `error` | `Daemon login failed: {status}` |

## 테스트 전략
- `authenticateWithRelay()` 함수를 export하여 단위 테스트
- global `fetch`를 모킹하여 3가지 시나리오 검증:
  1. 미등록 daemon: login 401 → register 201 → login 200
  2. 이미 등록된 daemon + 잘못된 secret: login 401 → register 409 → login 401 → throw
  3. 정상 daemon: login 200 → token 반환
- 기존 daemon 테스트 패턴(`packages/daemon/tests/`) 참조: 함수 단위 테스트, 의존성 모킹

## API/인터페이스 계약
N/A: Relay API 변경 없음. 기존 `POST /api/auth/daemon/register` (201/409)과 `POST /api/auth/daemon/login` (200/401)을 그대로 사용.

## 데이터 모델/스키마
N/A: DB 스키마 변경 없음. 기존 `daemons` 테이블 그대로 사용.

## 리스크/오픈 이슈
- register API가 down이면 login 재시도도 실패 → 기존 동작(relay 연결 skip)과 동일. 추가 리스크 없음.
