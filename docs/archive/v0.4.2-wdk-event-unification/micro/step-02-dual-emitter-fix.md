# Step 02: Dual Emitter 수정

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- `daemon/src/wdk-host.ts`에서 자체 emitter/broker 생성 코드 제거
- `createGuardedWDK()` 호출 후 `wdk.getApprovalBroker()`로 broker 획득
- `WDKInitResult`에서 broker를 factory 산출물로 변경
- `createMockWDK()`에 실제 EventEmitter + SignedApprovalBroker 내장
- factory 내부의 단일 emitter가 broker + middleware 이벤트 모두 발행하도록 확인

## 2. 완료 조건
- [ ] `wdk-host.ts`에 `new EventEmitter()` 호출 없음
- [ ] `wdk-host.ts`에 `new SignedApprovalBroker(...)` 직접 생성 없음 (factory 위임)
- [ ] `wdk.getApprovalBroker()` 호출로 broker 획득
- [ ] `createMockWDK()`의 `on()`이 실제 EventEmitter로 동작 (no-op 아님)
- [ ] `wdk.on('ApprovalVerified', handler)` 등록 시 broker 이벤트가 handler에 도달
- [ ] `tsc --noEmit` 통과 (guarded-wdk, daemon)
- [ ] 기존 daemon jest 테스트 통과

## 3. 롤백 방법
- git revert (wdk-host.ts 변경만)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── wdk-host.ts        # 수정 — emitter/broker 생성 제거, factory 위임
```

### Side Effect 위험
- `daemon/src/index.ts:38`에서 `initWDK()` 반환값의 `broker` 사용 — 타입은 동일하므로 영향 없음
- `daemon/src/index.ts:129-136`의 `wdk.on()` — 단일 emitter로 broker 이벤트도 수신하게 됨 (의도된 변경)

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 03: 원자적 Emit + ApprovalFailed](step-03-atomic-emit.md)
