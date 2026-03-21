# Daemon Self-Register - v0.3.6

## 문제 정의

### 현상
- Daemon이 첫 실행 시 `POST /api/auth/daemon/login`만 호출
- Relay에 등록되지 않은 daemon은 401 응답 → 에러 로그 출력 후 relay 연결 skip
- daemon을 처음 배포할 때 운영자가 수동으로 `POST /api/auth/daemon/register`를 호출해야 함

### 원인
- v0.3.0 설계 문서에 daemon self-register 플로우가 명시되어 있으나, daemon bootstrap 코드(`packages/daemon/src/index.ts:144-152`)에 register 호출 로직이 누락됨
- login 실패(401) 시 상태 코드를 구분하지 않고 일률적으로 throw하여 relay 연결을 포기

### 영향
- **자동 배포 불가**: 새 daemon 인스턴스 배포 시 수동 API 호출 필요
- **운영 부담**: daemon 재설치/환경 이동 시마다 수동 등록 절차 발생
- **Orchestration 진입 차단**: login 실패 시 enrollment 코드 발급, WS 연결, multi-user polling이 모두 불가 — daemon의 핵심 기능이 전면 중단됨
- **설계-구현 불일치**: v0.3.0 design.md의 Device Enrollment Flow 1단계(register)가 구현되지 않음

### 목표
- daemon 첫 실행 시 login 실패(401) → self-register → login 재시도 플로우 자동화
- 이미 등록된 daemon(register 409)은 에러 없이 login 재시도로 진행
- 수동 개입 없이 daemon이 relay에 자동 등록되어 운영 자동화 달성

### 401 구분 전략

Relay의 login API는 "미등록 daemon"과 "잘못된 secret" 모두 401을 반환한다. self-register 플로우는 이 두 경우를 다음과 같이 자연스럽게 구분한다:

| 시나리오 | login 1차 | register | login 재시도 | 최종 결과 |
|---------|-----------|----------|------------|----------|
| 미등록 daemon | 401 | **201** (등록 성공) | 200 (성공) | **정상 연결** |
| 기존 daemon + 올바른 secret | 200 | (skip) | (skip) | **정상 연결** |
| 기존 daemon + 잘못된 secret | 401 | **409** (이미 등록) | **401** (재실패) | **hard fail** |

- 잘못된 secret인 경우: register 409 → login 재시도 401 → throw Error. 추가 복구 경로 없음 — secret을 올바르게 설정해야 함.
- 이 동작은 의도적이다. 잘못된 자격 증명에 대한 무한 재시도나 우회를 만들지 않는다.

### 비목표 (Out of Scope)
- Relay 측 register/login API 수정 (이미 완전 구현됨)
- daemon secret 관리 정책 변경
- WS 연결/인증 로직 변경
- enrollment 플로우 변경
- login 401의 원인 구분을 위한 Relay API 응답 변경 (에러 코드 세분화 등)

## 제약사항
- 프로덕션 변경 범위는 daemon 패키지(`packages/daemon/`) 내부이며, relay API 변경은 없음
- Relay API는 현재 상태 그대로 사용 (register: 201/409, login: 200/401)
- daemon secret은 환경변수(`DAEMON_SECRET`)로 제공되며, relay에서 hashPassword()로 해싱 저장
