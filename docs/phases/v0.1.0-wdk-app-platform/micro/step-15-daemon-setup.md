# Step 15: daemon - package setup (package.json, config.js, entry point)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (canonical), guarded-wdk 패키지 존재

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon` 패키지 생성. daemon 프로세스의 기본 골격(진입점, 설정 로드, graceful shutdown)을 구축한다.

- `package.json`: name `@wdk-app/daemon`, dependencies (`@wdk-app/guarded-wdk`, `@wdk-app/canonical`, `@wdk-app/manifest`, `openai`, `ws`, `better-sqlite3`, `cron`)
- `config.js`: 환경변수 + 설정 파일 로드. `WDK_HOME` (기본 `~/.wdk`), `OPENCLAW_BASE_URL` (기본 `http://localhost:18789`), `RELAY_URL`, `OPENCLAW_API_KEY`, `ADMIN_SOCKET_PATH` 등
- `index.js`: 진입점. config 로드 → 로그 초기화 → graceful shutdown(SIGTERM/SIGINT) 핸들러 등록 → 각 모듈 시작 순서 정의 (이후 step에서 채움)
- 로그 포맷: stdout JSON format (`{ level, ts, msg, ...context }`)

## 2. 완료 조건
- [ ] `packages/daemon/package.json` 생성 (name: `@wdk-app/daemon`)
- [ ] `packages/daemon/src/config.js` 에서 `loadConfig()` export
- [ ] `loadConfig()`이 `WDK_HOME`, `OPENCLAW_BASE_URL`, `RELAY_URL`, `OPENCLAW_API_KEY`, `ADMIN_SOCKET_PATH` 반환
- [ ] `WDK_HOME` 미설정 시 기본값 `~/.wdk` 사용
- [ ] `OPENCLAW_BASE_URL` 미설정 시 기본값 `http://localhost:18789` 사용
- [ ] `packages/daemon/src/index.js` 에서 config 로드 + graceful shutdown 등록
- [ ] SIGTERM/SIGINT 수신 시 cleanup 함수 호출 후 process.exit(0)
- [ ] 루트 `package.json` workspaces에 `packages/daemon` 추가
- [ ] `npm test -- packages/daemon` 통과 (config 단위 테스트)

## 3. 롤백 방법
- `packages/daemon` 디렉토리 삭제
- 루트 `package.json`에서 workspace 제거

---

## Scope

### 신규 생성 파일
```
packages/daemon/
  package.json
  src/
    index.js              # 진입점 (config 로드 + graceful shutdown)
    config.js             # 설정 로드 (env + defaults)
  tests/
    config.test.js        # config 단위 테스트
```

### 수정 대상 파일
```
package.json              # workspaces에 packages/daemon 추가
```

### Side Effect 위험
- 없음 (신규 패키지, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| packages/daemon/package.json | 패키지 설정 | ✅ OK |
| packages/daemon/src/index.js | 진입점 + graceful shutdown | ✅ OK |
| packages/daemon/src/config.js | 설정 로드 | ✅ OK |
| packages/daemon/tests/config.test.js | 단위 테스트 | ✅ OK |
| package.json (루트) | workspaces 설정 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| loadConfig() | ✅ config.js | OK |
| graceful shutdown | ✅ index.js | OK |
| JSON 로그 포맷 | ✅ index.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 16: daemon - WDK 초기화](step-16-wdk-host.md)
