# Step 25: daemon - Admin server (Unix socket, wdk-admin CLI)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 16 (wdk-host), Step 23 (execution-journal)

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/admin-server.js` 생성. 로컬 Unix socket으로 `wdk-admin` CLI 도구가 접속하여 daemon 상태를 조회하고 관리 명령을 실행할 수 있는 서버를 구현한다. Admin surface는 OpenClaw tool에 등록하지 않아 AI가 접근할 수 없다 (보안 경계).

**Unix socket 경로**: `config.adminSocketPath` (기본 `~/.wdk/admin.sock`)

**Admin 명령**:

| 명령 | 요청 | 응답 | 설명 |
|------|------|------|------|
| `status` | `{ cmd: 'status' }` | `{ uptime, activeSeed, relayConnected, cronCount, pendingCount }` | daemon 상태 요약 |
| `journal_list` | `{ cmd: 'journal_list', seedId?, limit?, offset? }` | `{ entries: [...] }` | Execution Journal 목록 |
| `device_list` | `{ cmd: 'device_list' }` | `{ devices: [...] }` | 등록된 디바이스 목록 (active + revoked) |
| `cron_list` | `{ cmd: 'cron_list' }` | `{ crons: [...] }` | 등록된 cron 목록 |
| `seed_list` | `{ cmd: 'seed_list' }` | `{ seeds: [...], activeSeedId }` | seed 목록 |

- `createAdminServer(config, deps)`: Unix socket 서버 생성
  - `deps`: `{ getWDK, getStore, journal, cronScheduler }`
  - 연결당 JSON-line 프로토콜 (한 줄에 하나의 JSON 메시지)
  - 요청: `{ cmd, ...params }\n`
  - 응답: `{ ok: true, ...data }\n` 또는 `{ ok: false, error }\n`
- `start()`: socket 파일 생성 + listen 시작. 기존 socket 파일 있으면 제거 후 재생성
- `stop()`: socket 닫기 + socket 파일 삭제
- socket 파일 퍼미션: `0o600` (owner만 접근)

## 2. 완료 조건
- [ ] `packages/daemon/src/admin-server.js` 에서 `createAdminServer` export
- [ ] Unix socket이 `config.adminSocketPath`에 생성됨
- [ ] `status` 명령이 daemon 상태 (uptime, activeSeed, relayConnected, cronCount, pendingCount) 반환
- [ ] `journal_list` 명령이 Execution Journal 목록 반환 (seedId 필터, pagination)
- [ ] `device_list` 명령이 등록된 디바이스 목록 반환
- [ ] `cron_list` 명령이 등록된 cron 목록 반환
- [ ] `seed_list` 명령이 seed 목록 + activeSeedId 반환
- [ ] 알 수 없는 명령에 `{ ok: false, error: 'unknown command' }` 응답
- [ ] socket 파일 퍼미션 0o600
- [ ] `start()` 시 기존 socket 파일 제거 후 재생성
- [ ] `stop()` 시 socket 닫기 + 파일 삭제
- [ ] Admin 명령은 OpenClaw TOOL_DEFINITIONS에 포함되지 않음 (AI 접근 불가)
- [ ] `npm test -- packages/daemon` 통과 (admin-server 단위 테스트)

## 3. 롤백 방법
- `packages/daemon/src/admin-server.js` 삭제
- index.js에서 admin-server start/stop 호출 제거
- 관련 테스트 파일 삭제

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  admin-server.js         # Unix socket 서버 + Admin 명령 처리
packages/daemon/tests/
  admin-server.test.js    # 단위 테스트 (Unix socket 클라이언트 사용)
```

### 수정 대상 파일
```
packages/daemon/src/index.js    # admin-server start/stop 호출 추가
```

### Side Effect 위험
- `~/.wdk/admin.sock` 파일 생성/삭제
- 기존 socket 파일 덮어쓰기 (start 시)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| admin-server.js | Unix socket 서버 + Admin 명령 | ✅ OK |
| admin-server.test.js | 단위 테스트 | ✅ OK |
| index.js 수정 | start/stop 호출 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| createAdminServer | ✅ admin-server.js | OK |
| status 명령 | ✅ admin-server.js | OK |
| journal_list 명령 | ✅ admin-server.js | OK |
| device_list 명령 | ✅ admin-server.js | OK |
| cron_list 명령 | ✅ admin-server.js | OK |
| seed_list 명령 | ✅ admin-server.js | OK |
| socket 퍼미션 + 라이프사이클 | ✅ admin-server.js | OK |
| AI 접근 불가 (TOOL_DEFINITIONS 미포함) | ✅ tool-surface.js에 없음으로 검증 | OK |

### 검증 통과: ✅

---

→ 다음: Step 26 이후는 Relay 패키지 구현
