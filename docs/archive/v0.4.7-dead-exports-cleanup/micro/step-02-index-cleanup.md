# Step 02: index.ts 미사용 re-export 제거

## 메타데이터
- **난이도**: 🟢 쉬움 (기계적 작업)
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 (일부 A1 심볼이 index.ts에서도 re-export되므로, Step 01 후 dead-exports 체크로 잔여 확인)

---

## 1. 구현 내용 (design.md 기반)

### guarded-wdk index.ts (~16건)
모노레포 내 다른 패키지가 import하지 않는 re-export 제거.
v0.4.6에서 `approval-store` → `wdk-store` 리네임 반영.

**제거 후보** (Step 01 후 dead-exports 체크로 최종 확정):
- `sign`, `generateKeyPair`, `KeyPair`
- `WalletNotFoundError`, `NoMasterSeedError`
- `permissionsToDict`
- `SignTransactionResult`
- `FailedArg`, `RuleFailure`, `EvaluationResult`
- `JsonWdkStore`, `SqliteWdkStore` (v0.4.6 리네임 후 신규 dead)
- `CallPolicy`, `TimestampPolicy` (Step 01에서 export 제거 후 상태에 따라)

### protocol index.ts (~33건)
유니온 멤버 개별 re-export 제거. 부모 유니온(`ChatEvent`, `ControlEvent`, `ControlResult`, `AnyWDKEvent`)은 유지.

**제거 대상**: 개별 이벤트/결과 타입 전부 + wire 서브타입.
**유지 대상**: `ControlMessage`, `ControlResult`, `ControlEvent`, `RelayChatInput`, `ChatEvent`, `RelayChannel`, `RelayEnvelope`, `AnyWDKEvent`, `ToolResultWire`, `SignedApprovalFields`

### canonical index.ts (3건)
- `ChainId` — 구조적 추론으로 충분
- `IntentInput` — `intentHash()` 파라미터, 구조적 추론으로 충분
- `sortKeysDeep` — 내부 유틸, `canonicalJSON()`만 외부 사용

## 2. 완료 조건
- [ ] guarded-wdk index.ts에서 미사용 re-export 제거 완료
- [ ] protocol index.ts에서 유니온 멤버 개별 re-export 제거 완료
- [ ] canonical index.ts에서 미사용 re-export 3건 제거 완료
- [ ] `npx tsc --noEmit` 전 패키지 통과 (guarded-wdk, daemon, app, protocol, canonical)
- [ ] `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 → 남은 violation이 모두 `packages/manifest/**`
- [ ] `npx tsx scripts/check/index.ts` 전체 실행 → 기존 16개 PASS 체크 퇴행 없음 (DoD N6)

## 3. 롤백 방법
- `git revert <step-02 commit>` — 이 Step의 커밋만 되돌림

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
└── index.ts                   # ~14건 re-export 제거

packages/protocol/src/
└── index.ts                   # ~33건 re-export 제거

packages/canonical/src/
└── index.ts                   # 3건 re-export 제거
```

## FP/FN 검증

### False Positive (과잉) — tsc가 안전망
실수로 사용 중인 심볼을 제거하면 tsc 에러. FP 발생 시 즉시 감지 + 복원.

### False Negative (누락)
Step 01 후 dead-exports 체크를 다시 실행하여 잔여 violation 확인. 누락 불가.

### 검증 통과: ✅
