# DoD (Definition of Done) - v0.3.6

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `authenticateWithRelay()` 함수가 `packages/daemon/src/relay-auth.ts`에 export됨 | 테스트 파일이 `relay-auth.ts`에서 `authenticateWithRelay`를 import하여 실행 성공 |
| F2 | 미등록 daemon: login 401 → register 201 → login 재시도 200 → token 반환 | 단위 테스트 통과 |
| F3 | 이미 등록된 daemon + 잘못된 secret: login 401 → register 409 → login 재시도 401 → throw Error | 단위 테스트 통과 |
| F4 | 정상 daemon (이미 등록 + 올바른 secret): login 200 → token 반환 (register 호출 없음) | 단위 테스트 통과 (fetch 호출 횟수 검증: login 1회만) |
| F5 | 동시 등록(concurrent registration): login 401 → register 409 → login 재시도 200 → token 반환 | 단위 테스트 통과 |
| F6 | register 성공 시 `logger.info` 호출 (self-registered 메시지) | 단위 테스트에서 logger spy 검증 |
| F7 | register 409 후 login 재실패 시 `logger.error` 호출 (wrong DAEMON_SECRET 메시지) | 단위 테스트에서 logger spy 검증 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 이번 변경(`relay-auth.ts`, `index.ts` import)으로 인한 새 tsc 에러 0개 | `npx tsc --noEmit 2>&1 \| grep relay-auth` 결과 0건 |
| N2 | 기존 daemon 테스트 모두 통과 | `cd packages/daemon && npm test` |
| N3 | 이번 변경으로 인한 새 빌드 에러 0개 (기존 pre-existing 에러는 별도 Phase에서 처리) | `npm run build 2>&1 \| grep relay-auth` 결과 0건 |
| N4 | `index.ts`가 `const token = await authenticateWithRelay(...)` 형태로 helper를 호출하고, 같은 token을 enroll Authorization과 `relayClient.connect(..., token)`에 사용 | 소스 구조 검증: `rg 'authenticateWithRelay\|Authorization.*token\|\.connect.*token' packages/daemon/src/index.ts`로 3개 지점 확인 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | register API가 5xx 응답 | throw Error, relay 연결 skip | 단위 테스트: register 500 응답 시 throw 확인 |
| E2 | login이 401이 아닌 다른 에러(500, 503 등) | register 시도 없이 바로 throw | 단위 테스트: login 500 응답 시 register 미호출 + throw 확인 |
| E3 | register 201 후 login 재시도가 비-401 에러(500 등) | throw Error | 단위 테스트: login 재시도 500 응답 시 throw 확인 |

## 로깅 완료 조건

설계의 로그 계약 중 **필수 로그**:

| # | 시나리오 | 레벨 | 메시지 키워드 | 검증 방법 |
|---|---------|------|------------|----------|
| L1 | register 201 (등록 성공) | `info` | `self-registered` | logger spy |
| L2 | register 409 후 login 재실패 | `error` | `wrong DAEMON_SECRET` | logger spy |
| L3 | register 실패 (5xx) | `error` | `self-register failed` | logger spy |

그 외 intermediate 로그(`Daemon not registered, attempting self-register`, `Daemon already registered, retrying login` 등)는 권장이며, DoD 검증 대상은 아님.
