# Step 03: daemon + 테스트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert, 단 Step 04와 함께 같은 PR)
- **선행 조건**: Step 02 완료

---

## 1. 구현 내용 (design.md 기반)
- `control-handler.ts`: `ControlPayload.deviceId` → `signerId`, `saveDevice` → `saveSigner`, `listDevices` → `listSigners`, `metadata.deviceId` → `metadata.signerId`, 로그 메시지 업데이트
- `wdk-host.ts`: `listDevices` → `listSigners`, 변수명 `devices` → `signers`
- `admin-server.ts`: `device_list` → `signer_list`, response `devices` → `signers`, `d.deviceId` → `s.signerId`, `d.pairedAt` → `s.registeredAt`
- 테스트 파일 1개: mock store/data rename
  - `control-handler.test.ts`

## 2. 완료 조건
- [ ] `grep -rn "deviceId\|listDevices\|saveDevice\|revokeDevice\|pairedAt\|device_list" packages/daemon/src/` → 0 결과
- [ ] `grep -rn "deviceId\|listDevices\|saveDevice\|device_list\|pairedAt" packages/daemon/tests/control-handler.test.ts` → 0 결과
- [ ] daemon `tsc --noEmit` 통과
- [ ] daemon rename 영향 테스트 통과: `cd packages/daemon && npx jest control-handler.test` (tool-surface.test.ts의 기존 rootDir 실패는 이 Phase scope 외)

## 3. 롤백 방법
- `git revert <commit-hash>` (Step 04도 함께 revert — 같은 PR이므로)
- 영향 범위: daemon 패키지. app이 아직 old protocol이면 protocol 불일치 발생 → D1 (동일 PR) 필수

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/
│   ├── control-handler.ts  # ControlPayload + handler rename
│   ├── wdk-host.ts         # listDevices → listSigners
│   └── admin-server.ts     # device_list → signer_list + response rename
└── tests/
    └── control-handler.test.ts  # mock store/data rename
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| control-handler.ts | 직접 수정 | control protocol handler |
| wdk-host.ts | 직접 수정 | startup signer loading |
| admin-server.ts | 직접 수정 | admin API |
| control-handler.test.ts | 직접 수정 | 테스트 mock/assertion |
| app (SettingsScreen 등) | 간접 영향 | protocol consumer — Step 04에서 수정 |

### Side Effect 위험
- daemon↔app protocol 불일치: daemon이 `signerId`를 기대하지만 app이 아직 `deviceId`를 보냄 → Step 04 필수, 같은 PR (D1)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| control-handler.ts | ControlPayload.deviceId, handler rename | ✅ OK |
| wdk-host.ts | listDevices → listSigners | ✅ OK |
| admin-server.ts | device_list, response rename | ✅ OK |
| control-handler.test.ts | mock store/data | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ControlPayload rename | control-handler.ts ✅ | OK |
| admin command rename | admin-server.ts ✅ | OK |
| listDevices → listSigners | wdk-host.ts ✅ | OK |
| 테스트 업데이트 | control-handler.test.ts ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: app shared contract + protocol consumers](step-04-app.md)
