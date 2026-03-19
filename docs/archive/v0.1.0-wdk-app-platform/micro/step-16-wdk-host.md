# Step 16: daemon - WDK 초기화 (seed load, createGuardedWDK)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 15 (daemon-setup), guarded-wdk의 SignedApprovalBroker + SqliteApprovalStore 구현 완료

---

## 1. 구현 내용 (design.md 기반)

`packages/daemon/src/wdk-host.js` 생성. daemon이 시작할 때 ApprovalStore에서 active seed를 로드하고 `createGuardedWDK`로 WDK 인스턴스를 생성한다.

- `initWDK(config)`: SqliteApprovalStore 초기화 (`~/.wdk/store/wdk.db`) → active seed 조회 → SignedApprovalBroker 생성 (trustedApprovers from devices table) → `createGuardedWDK({ seed, wallets, protocols, policies, approvalBroker, approvalStore })`
- `getWDK()`: 현재 WDK 인스턴스 반환
- `getBroker()`: 현재 SignedApprovalBroker 인스턴스 반환
- `getStore()`: 현재 ApprovalStore 인스턴스 반환
- `switchSeed(seedId)`: 현재 WDK dispose → 새 seed로 재생성 (seed별 policy/pending/cron/journal 보존)
- DB 파일 퍼미션: `chmod 600` (seed 보호, DoD F2)

## 2. 완료 조건
- [ ] `packages/daemon/src/wdk-host.js` 에서 `initWDK`, `getWDK`, `getBroker`, `getStore`, `switchSeed` export
- [ ] `initWDK(config)` 호출 시 SqliteApprovalStore가 `config.wdkHome + '/store/wdk.db'`에 생성됨
- [ ] active seed가 없으면 에러 throw (`NoActiveSeedError`)
- [ ] active seed가 있으면 createGuardedWDK 호출 → WDK 인스턴스 반환
- [ ] trustedApprovers가 devices 테이블의 active(revoked_at IS NULL) 디바이스 public key 목록으로 설정
- [ ] `switchSeed(seedId)` 호출 시 기존 WDK dispose + 새 seed로 재생성
- [ ] DB 파일 생성 시 퍼미션 0o600 적용
- [ ] `npm test -- packages/daemon` 통과 (wdk-host 단위 테스트, mock store 사용)

## 3. 롤백 방법
- `packages/daemon/src/wdk-host.js` 삭제
- `index.js`에서 wdk-host import/호출 제거

---

## Scope

### 신규 생성 파일
```
packages/daemon/src/
  wdk-host.js             # WDK 초기화 + seed 로드 + switchSeed
packages/daemon/tests/
  wdk-host.test.js        # 단위 테스트 (mock store/WDK)
```

### 수정 대상 파일
```
packages/daemon/src/index.js    # initWDK() 호출 추가
```

### Side Effect 위험
- `~/.wdk/store/wdk.db` 파일 생성 (최초 실행 시)
- 파일 퍼미션 변경 (chmod 600)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| wdk-host.js | WDK 초기화 + seed load | ✅ OK |
| wdk-host.test.js | 단위 테스트 | ✅ OK |
| index.js 수정 | initWDK 호출 연결 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| initWDK | ✅ wdk-host.js | OK |
| getWDK / getBroker / getStore | ✅ wdk-host.js | OK |
| switchSeed | ✅ wdk-host.js | OK |
| DB 퍼미션 600 | ✅ wdk-host.js | OK |
| trustedApprovers 로드 | ✅ wdk-host.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 17: daemon - 9개 agent tool 정의](step-17-tool-surface.md)
