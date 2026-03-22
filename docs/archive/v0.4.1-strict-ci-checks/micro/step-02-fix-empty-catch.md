# Step 02: Empty Catch 위반 수정

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- daemon/relay-client.ts — 4곳 empty catch → logger.debug() 추가
- daemon/admin-server.ts — 1곳 empty catch → logger.debug() 추가
- daemon/message-queue.ts — ProcessResult 타입 도입 + empty catch → logger 로깅
- guarded-wdk/guarded-middleware.ts — polling catch → emitter.emit() 추가
- app/RelayClient.ts — 1곳 empty catch → statement 추가
- app/SettingsScreen.tsx — 1곳 empty catch → statement 추가
- app/ChatDetailScreen.tsx — 1곳 empty catch → statement 추가
- app/DashboardScreen.tsx — 1곳 empty catch → statement 추가

## 2. 완료 조건
- [ ] `npx tsx scripts/check/index.ts --check=cross/no-empty-catch` → 0 violations
- [ ] message-queue.ts의 MessageProcessor가 ProcessResult를 반환한다
- [ ] message-queue.ts의 _drain() catch에 logger 호출이 있다
- [ ] guarded-middleware.ts의 polling catch에 emitter.emit() 호출이 있다
- [ ] 모든 수정된 catch block에 logger.*/emitter.emit/throw/return 중 하나가 있다

## 3. 롤백 방법
- git revert (각 파일의 catch 블록 복원)

---

## Scope

### 수정 대상 파일 (13곳)
```
packages/daemon/src/
├── relay-client.ts       # 4곳 — :218, :263, :382, :392
├── admin-server.ts       # 1곳 — :171
└── message-queue.ts      # 1곳 — :102 + ProcessResult 타입 도입

packages/guarded-wdk/src/
└── guarded-middleware.ts  # 1곳 — :320

packages/app/src/
├── core/relay/RelayClient.ts                          # 1곳 — :323
├── domains/settings/screens/SettingsScreen.tsx         # 1곳 — :123
├── domains/chat/screens/ChatDetailScreen.tsx           # 1곳 — :302
└── domains/dashboard/screens/DashboardScreen.tsx       # 1곳 — :153
```

### Side Effect 위험
- message-queue.ts ProcessResult 도입: daemon/src/index.ts의 processor 콜백 수정 필요

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 근거 | 판정 |
|-----------|------|------|
| relay-client.ts ×4 | 실제 empty catch 확인 (:218, :263, :382, :392) | ✅ OK |
| admin-server.ts ×1 | 실제 empty catch 확인 (:171) | ✅ OK |
| message-queue.ts ×1 | 실제 empty catch + ProcessResult 도입 | ✅ OK |
| guarded-middleware.ts ×1 | 실제 empty catch 확인 (:320) | ✅ OK |
| app RelayClient.ts ×1 | 실제 empty catch 확인 (:323) | ✅ OK |
| app SettingsScreen.tsx ×1 | 실제 empty catch 확인 (:123) | ✅ OK |
| app ChatDetailScreen.tsx ×1 | 실제 empty catch 확인 (:302) | ✅ OK |
| app DashboardScreen.tsx ×1 | 실제 empty catch 확인 (:153) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| daemon/index.ts processor 콜백 | ProcessResult side effect로 수정 필요 | ✅ Scope에 Side Effect로 기록됨 |

### 검증 통과: ✅

---

→ 다음: [Step 03: Console 위반 수정](step-03-fix-console.md)
