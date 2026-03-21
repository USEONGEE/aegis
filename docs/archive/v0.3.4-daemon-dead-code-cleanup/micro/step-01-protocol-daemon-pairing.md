# Step 01: Protocol + Daemon pairing 전면 제거 + chat-handler 정리

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용

**Protocol:**
- `PairingConfirmPayload` interface 제거 (`protocol/src/control.ts:29-35`)
- `ControlMessage` union에서 `pairing_confirm` variant 제거 (`protocol/src/control.ts:52`)
- barrel export 정리 (`protocol/src/index.ts`)

**Daemon control-handler:**
- `PairingSession` interface 제거 (`control-handler.ts:14-20`)
- `handleControlMessage` 시그니처에서 `pairingSession` 파라미터 제거 (`control-handler.ts:64`)
- `pairing_confirm` case 블록 전체 제거 (`control-handler.ts:226-298`)

**Daemon index.ts:**
- `PairingSession` import 제거 (`index.ts:9`)
- `pairingSession` 변수 + 주석 제거 (`index.ts:64-65`)
- `handleControlMessage` 호출에서 `pairingSession` 인자 제거 (`index.ts:96`)

**Daemon chat-handler:**
- `handleChatMessage` 시그니처에서 `queueManager?` → `queueManager` required (`chat-handler.ts:30`)
- else 분기 (direct processing) 제거 (`chat-handler.ts:61-62`)

**Tests:**
- pairing_confirm 테스트 3건 제거 (`control-handler.test.ts:102-176`)

## 2. 완료 조건
- [ ] `grep "PairingConfirmPayload" packages/protocol/src/control.ts` → 결과 없음 (F11)
- [ ] `grep "pairing_confirm" packages/protocol/src/control.ts` → 결과 없음 (F12)
- [ ] `grep "PairingConfirmPayload" packages/protocol/src/index.ts` → 결과 없음 (F13)
- [ ] `grep -r "PairingSession" packages/daemon/src/` → 결과 없음 (F1)
- [ ] `grep "pairing_confirm" packages/daemon/src/control-handler.ts` → 결과 없음 (F2)
- [ ] `grep "pairingSession" packages/daemon/src/control-handler.ts` → 결과 없음 (F3)
- [ ] `grep -E "pairingSession|PairingSession" packages/daemon/src/index.ts` → 결과 없음 (F4)
- [ ] `grep "queueManager?" packages/daemon/src/chat-handler.ts` → 결과 없음 (F5)
- [ ] `grep -c "_processChatDirect" packages/daemon/src/chat-handler.ts` → 1 (F6)
- [ ] `grep -A5 "default:" packages/daemon/src/control-handler.ts` → `Unknown control type` 확인 (E1)
- [ ] `cd packages/protocol && npx tsc --noEmit` 통과 (N2)
- [ ] `cd packages/daemon && npx tsc --noEmit` 통과 (N1)
- [ ] `cd packages/daemon && npx jest` 통과 (N3, E2)

## 3. 롤백 방법
- `git checkout -- packages/protocol/src/ packages/daemon/src/control-handler.ts packages/daemon/src/index.ts packages/daemon/src/chat-handler.ts packages/daemon/tests/control-handler.test.ts`

---

## Scope

### 수정 대상 파일
```
packages/
├── protocol/src/
│   ├── control.ts   # 수정 - PairingConfirmPayload + variant 제거
│   └── index.ts     # 수정 - barrel export 정리
└── daemon/
    ├── src/
    │   ├── control-handler.ts  # 수정 - PairingSession + pairing_confirm + 시그니처
    │   ├── index.ts             # 수정 - import + 변수 + 호출 인자
    │   └── chat-handler.ts      # 수정 - queueManager required + else 삭제
    └── tests/
        └── control-handler.test.ts  # 수정 - pairing_confirm 테스트 3건 삭제
```

## FP/FN 검증

### 검증 통과: ✅
모든 scope 파일이 구현 내용에 직접 대응하며, 구현 내용의 모든 항목이 scope에 포함됨.

---

→ 다음: [Step 02: Daemon 잔여 dead code 정리](step-02-daemon-misc-cleanup.md)
