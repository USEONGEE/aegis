# Step 06: guarded-wdk - JsonApprovalStore 구현

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 05

---

## 1. 구현 내용 (design.md 기반)

`packages/guarded-wdk/src/json-approval-store.js`에 JSON 파일 기반 ApprovalStore 구현. `~/.wdk/store/*.json` 경로에 데이터를 영속 저장.

### 파일 구조

```
~/.wdk/store/
  policies.json          # { [seedId:chain]: SignedPolicy }
  pending.json           # { [requestId]: PendingRequest }
  history.json           # HistoryEntry[]
  devices.json           # { [deviceId]: Device }
  nonces.json            # { [approver:deviceId]: number }
  crons.json             # { [cronId]: CronEntry }
  seeds.json             # { [seedId]: SeedEntry }
```

### 구현 원칙

1. **읽기**: 파일이 없으면 기본값 반환 (빈 객체/배열)
2. **쓰기**: JSON.stringify(data, null, 2)로 파일에 기록 (가독성)
3. **원자적 쓰기**: 임시 파일에 쓰고 rename (데이터 손실 방지)
4. **디렉토리 자동 생성**: 첫 쓰기 시 `~/.wdk/store/` 디렉토리가 없으면 `mkdirSync(recursive: true)`
5. **생성자**: `new JsonApprovalStore(basePath)` — basePath 기본값은 `~/.wdk/store`

### 핵심 메서드 구현

```javascript
class JsonApprovalStore extends ApprovalStore {
  constructor(basePath = path.join(os.homedir(), '.wdk', 'store'))

  // 내부 헬퍼
  _readJson(filename, defaultValue) {}
  _writeJson(filename, data) {}          // 원자적 쓰기

  // ApprovalStore 22개 메서드 전부 구현
  async loadPolicy(seedId, chain) {}
  async savePolicy(seedId, chain, signedPolicy) {}
  // ... 나머지 20개
}
```

### 다중 seed 분리

- `policies.json` 키: `${seedId}:${chain}`
- `pending.json`: 각 entry에 `seedId` 필드, `loadPending(seedId)` 시 필터링
- `history.json`: 각 entry에 `seedId` 필드, `getHistory(seedId)` 시 필터링
- `crons.json`: 각 entry에 `seedId` 필드, `listCrons(seedId)` 시 필터링
- `seeds.json`: seedId가 키

### Seed 관리

- `addSeed(name, mnemonic)`: UUID 생성, `seeds.json`에 추가. 첫 seed면 `isActive: true`
- `setActiveSeed(seedId)`: 기존 active를 false로, 새 seed를 true로
- `getActiveSeed()`: `isActive === true`인 seed 반환

## 2. 완료 조건
- [ ] `packages/guarded-wdk/src/json-approval-store.js` 파일 생성
- [ ] `JsonApprovalStore extends ApprovalStore`
- [ ] 22개 메서드 전부 구현 (Not implemented 에러 없음)
- [ ] `loadPolicy(seedId, chain)` → 저장된 SignedPolicy 반환, 없으면 null
- [ ] `savePolicy(seedId, chain, sp)` → `policies.json`에 영속, 재로드 시 동일 데이터
- [ ] `loadPending(seedId)` → 해당 seed의 pending만 반환
- [ ] `savePending(seedId, req)` → `pending.json`에 영속
- [ ] `removePending(requestId)` → 해당 entry 삭제
- [ ] `appendHistory(seedId, entry)` → `history.json`에 추가
- [ ] `getHistory(seedId, { type, chain, limit, offset })` → 필터링된 결과
- [ ] `saveDevice/getDevice/revokeDevice/listDevices` CRUD 동작
- [ ] `getLastNonce(approver, deviceId)` → 없으면 0, 있으면 마지막 값
- [ ] `updateNonce(approver, deviceId, nonce)` → nonce 업데이트
- [ ] `listCrons/saveCron/removeCron/updateCronLastRun` CRUD 동작
- [ ] `addSeed/getSeed/removeSeed/setActiveSeed/getActiveSeed/listSeeds` CRUD 동작
- [ ] seed A의 policy ≠ seed B의 policy (DoD F17)
- [ ] 존재하지 않는 basePath에서 첫 쓰기 시 디렉토리 자동 생성
- [ ] 파일 삭제 후 재시작 → 빈 상태로 정상 동작
- [ ] `src/index.js`에서 `JsonApprovalStore` re-export
- [ ] `npm test -- packages/guarded-wdk` 통과

## 3. 롤백 방법
- `packages/guarded-wdk/src/json-approval-store.js` 삭제
- `index.js`에서 `JsonApprovalStore` re-export 제거
- 테스트가 생성한 임시 store 디렉토리 정리

---

## Scope

### 신규 생성 파일
```
packages/guarded-wdk/src/json-approval-store.js      # JsonApprovalStore 구현
packages/guarded-wdk/tests/json-approval-store.test.js  # CRUD 단위 테스트
```

### 수정 대상 파일
```
packages/guarded-wdk/src/index.js   # JsonApprovalStore re-export 추가
```

### Side Effect 위험
- 테스트 실행 시 임시 디렉토리에 JSON 파일 생성 (테스트 후 cleanup 필요)
- 기존 코드에 영향 없음 (신규 파일 + export 추가)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| json-approval-store.js | PRD JsonApprovalStore 구현 | ✅ OK |
| json-approval-store.test.js | DoD F14 (각 메서드 CRUD) | ✅ OK |
| index.js 수정 | re-export | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 22개 메서드 구현 | ✅ json-approval-store.js | OK |
| 원자적 쓰기 | ✅ json-approval-store.js | OK |
| 다중 seed 분리 | ✅ json-approval-store.js | OK |
| 디렉토리 자동 생성 | ✅ json-approval-store.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 07: guarded-wdk - SqliteApprovalStore](step-07-sqlite-approval-store.md)
