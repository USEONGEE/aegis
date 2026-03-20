# Step 06: daemon 전면 연동

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02, Step 03, Step 04, Step 05

---

## 1. 구현 내용 (design.md 기반)
- `WDKContext`: `seedId` 제거, `account` 제거
- `tool-surface.ts`: 모든 도구에 `accountIndex` 파라미터 추가, `wdk.getAccount(chain, accountIndex)`, intentId → intentHash
- `execution-journal.ts`: seedId 파라미터 제거, intentId → intentHash PK 전환
- `cron-scheduler.ts`: seedId 파라미터 제거, 전체 cron 관리, StoredCron.accountIndex 사용
- `wdk-host.ts`: `getActiveSeed()` → `getMasterSeed()` + `listWallets()`, 각 wallet별 정책 복원
- `control-handler.ts`: metadata 접근 → accountIndex/content 정규 필드
- `admin-server.ts`: seed_list → wallet_list, getActiveSeed → listWallets
- `index.ts`: seedId 제거, WDKContext 조립 변경
- tool definitions JSON에 `accountIndex` 필드 추가

## 2. 완료 조건
- [ ] `grep -r 'seedId' packages/daemon/src/` 결과 0건
- [ ] `grep -r 'intentId' packages/daemon/src/` 결과 0건
- [ ] `grep -r 'metadata' packages/daemon/src/control-handler.ts` 결과 0건
- [ ] `grep -r 'getActiveSeed\|seed_list' packages/daemon/src/admin-server.ts` 결과 0건
- [ ] `grep 'listWallets\|wallet_list' packages/daemon/src/admin-server.ts` 매칭
- [ ] tool definitions에 `accountIndex` 필드 존재 (sendTransaction, signTransaction, transfer, registerCron, policyRequest)
- [ ] `cd packages/daemon && npx tsc --noEmit` 에러 0
- [ ] `cd packages/daemon && npm test` 전체 통과

## 3. 롤백 방법
- `git revert`

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
├── index.ts               # seedId 제거, WDKContext 조립
├── wdk-host.ts            # getMasterSeed + listWallets
├── tool-surface.ts        # 전면 수정 (accountIndex, intentHash)
├── execution-journal.ts   # seedId 제거, intentHash PK
├── cron-scheduler.ts      # seedId 제거
├── control-handler.ts     # metadata → 정규 필드
└── admin-server.ts        # seed → wallet API
packages/daemon/tests/
└── tool-surface.test.ts   # seedId → accountIndex, intentId → intentHash
```

### Side Effect 위험
- 가장 큰 Step 중 하나. tool definitions JSON 구조 변경으로 AI 프롬프트 영향.

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| index.ts | seedId 제거, WDKContext 조립 | ✅ OK |
| wdk-host.ts | getMasterSeed + listWallets | ✅ OK |
| tool-surface.ts | accountIndex, intentHash 전면 수정 | ✅ OK |
| execution-journal.ts | seedId 제거, intentHash PK | ✅ OK |
| cron-scheduler.ts | seedId 제거 | ✅ OK |
| control-handler.ts | metadata → 정규 필드 | ✅ OK |
| admin-server.ts | seed → wallet API | ✅ OK |
| openclaw-client.ts | ❌ FP — 구현 내용에 직접 근거 없음 → Scope에서 제거 |
| tool-surface.test.ts | 테스트 수정 | ✅ OK |

### False Negative (누락)
없음

### Scope 수정
- `openclaw-client.ts` Scope에서 제거 (직접 수정 불필요)

### 검증 통과: ✅

---

→ 다음: [Step 07: app 최소 연동](step-07-app.md)
