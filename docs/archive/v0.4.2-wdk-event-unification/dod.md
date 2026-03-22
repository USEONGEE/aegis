# DoD (Definition of Done) - v0.4.2

## 기능 완료 조건

### F1. Dual Emitter 수정
- [ ] daemon의 wdk-host.ts에서 자체 emitter/broker 생성 코드 제거
- [ ] daemon이 `wdk.getApprovalBroker()`로 broker를 획득
- [ ] factory 내부의 단일 emitter가 broker + middleware 이벤트 모두 발행
- [ ] `wdk.on('PolicyApplied', ...)` 등록 시 broker 이벤트가 실제로 수신됨
- [ ] mock WDK에서도 `on()`이 실제 EventEmitter로 동작
- 검증: unit test — mock broker에서 emit → wdk.on()으로 수신 확인

### F2. WDK 이벤트 타입 규격화 (14종)
- [ ] `protocol/src/events.ts` 신규 파일에 `WDKEventBase`, 14종 개별 이벤트 타입, `AnyWDKEvent` union 정의
- [ ] 모든 이벤트에 `type` (discriminant) + `timestamp` 필드 존재
- [ ] guarded-wdk가 `AnyWDKEvent` 타입에 맞춰 emit (기존 emit 호출부 타입 적용)
- 검증: `tsc --noEmit` (guarded-wdk, daemon, protocol)

### F3. 이벤트 발행 원자성
- [ ] broker.submitApproval() 내부에서 도메인 처리(검증→도메인작업→히스토리) 완료 후에만 성공 이벤트 발행
- [ ] 도메인 처리 중 실패 시 ApprovalFailed만 발행 (성공 이벤트 없음)
- [ ] 성공 시 발행 순서: ApprovalVerified 먼저, 도메인 이벤트(PolicyApplied 등) 나중
- 검증: unit test — (1) 성공 시 ApprovalVerified + 도메인이벤트 순서 확인 (2) 실패 시 ApprovalFailed만 확인 (3) 중간 실패 시 ApprovalVerified 없음 확인

### F4. ApprovalFailed 이벤트 추가
- [ ] guarded-wdk의 broker.submitApproval()에서 verifyApproval 실패 시 `ApprovalFailed` emit
- [ ] 도메인 작업(savePolicy, revokeSigner 등) 실패 시에도 `ApprovalFailed` emit
- [ ] `ApprovalFailed` payload: `{ type: 'ApprovalFailed', timestamp, requestId, approvalType, error }`
- [ ] daemon의 RELAY_EVENTS에 `'ApprovalFailed'` 추가 (13→14종)
- 검증: unit test — 각 실패 시나리오에서 ApprovalFailed emit 확인

### F5. Daemon store 직접 접근 제거
- [ ] `control-handler.ts`에서 `approvalStore.savePolicy()` 직접 호출 제거
- [ ] `control-handler.ts`에서 `approvalStore.listSigners()` + `broker.setTrustedApprovers()` 직접 호출 제거
- [ ] broker.submitApproval()이 policy_approval 시 savePolicy 수행 (ApprovalSubmitContext.policies 사용)
- [ ] broker.submitApproval()이 device_revoke 시 자동으로 setTrustedApprovers 수행
- [ ] control-handler의 승인 6종 브랜치가 `broker.submitApproval(signedApproval, context)` 한 줄로 단순화
- 검증: grep 확인 — control-handler.ts에 `approvalStore.save`/`approvalStore.list`/`setTrustedApprovers` 호출 없음

### F6. ControlResult forward 제거 (승인 6종)
- [ ] daemon의 index.ts에서 승인 6종의 ControlResult를 relay로 forward하지 않음
- [ ] cancel_queued, cancel_active의 ControlResult는 기존대로 relay forward 유지
- [ ] handleControlMessage가 승인 시 null 반환, cancel 시 ControlResult 반환
- 검증: integration test — (1) 승인 6종 처리 후 relay.send('control', result) 호출 없음 (2) cancel_queued/cancel_active 처리 후 relay.send('control', result) 호출 있음

### F7. EventStreamEvent 정리
- [ ] `protocol/src/control.ts`의 `EventStreamEvent`에서 `eventName` 필드 제거
- [ ] `event.type`이 유일한 이벤트 종류 판별자
- [ ] `event` 필드 타입이 `AnyWDKEvent` (was: `unknown`)
- [ ] daemon의 event relay 코드(`index.ts`)에서 eventName 제거 반영
- 검증: wire shape 회귀 테스트 — `{ type: 'event_stream', event: { type: '...', timestamp, ... } }` 형태 확인

### F8. ApprovalSubmitContext 도입
- [ ] `ApprovalSubmitContext` discriminated union 정의 (6종 kind)
- [ ] broker.submitApproval() 시그니처가 `(signedApproval, context: ApprovalSubmitContext)` 로 변경
- [ ] 기존 `VerificationContext` 용도가 ApprovalSubmitContext로 대체
- 검증: tsc — 호출부(control-handler)와 구현부(broker) 타입 일치 확인

## 비기능 완료 조건

### NF1. 타입 안전
- [ ] `tsc --noEmit` 통과: guarded-wdk, daemon, protocol 3개 패키지
- [ ] CI 체크 통과: `npx tsx scripts/check/index.ts`
- 검증: CI 실행 결과

### NF2. 테스트
- [ ] 기존 테스트 회귀 없음 (daemon jest, guarded-wdk jest)
- [ ] broker.submitApproval 원자적 emit 테스트 (성공/실패 각 시나리오)
- [ ] event_stream wire shape 회귀 테스트
- 검증: jest 실행 결과

### NF3. 의존 방향
- [ ] protocol → guarded-wdk 역방향 의존 없음 (이벤트 타입은 protocol 소유)
- [ ] daemon → store 직접 접근 없음 (broker를 통해서만)
- 검증: `npx tsx scripts/check/index.ts --check=cross/no-cross-package-import`

### NF4. 후속 의존 작업 연결
- [ ] app이 ControlResult 대신 ApprovalVerified/ApprovalFailed를 수신하도록 변경하는 후속 Phase/티켓이 문서화되어 있음
- 검증: PROGRESS.md 또는 CLAUDE.md에 후속 작업 기록

## 엣지 케이스

### E1. 빈 trustedApprovers로 부팅
- [ ] factory가 `trustedApprovers: []`로 broker 생성 허용
- [ ] daemon이 이후 `broker.setTrustedApprovers(signers)`로 업데이트
- 검증: unit test — 빈 배열로 factory 생성 → setTrustedApprovers 호출 → 정상 동작

### E2. Mock WDK 이벤트 전달
- [ ] mock WDK에서 broker.submitApproval() 호출 시 이벤트가 `wdk.on()`으로 전달
- 검증: unit test — mock WDK on() 리스너가 broker 이벤트 수신

### E3. verifyApproval 실패 + ApprovalFailed
- [ ] 서명 검증 실패 시 ApprovalFailed 이벤트가 relay를 통해 app에 전달 가능
- 검증: unit test — verifyApproval throw → ApprovalFailed emit 확인

### E4. appendHistory 실패 (원자성 경계 안)
- [ ] history 기록 실패 시 ApprovalFailed 발행, 성공 이벤트 없음
- 검증: unit test — store.appendHistory throw → ApprovalFailed emit, ApprovalVerified 없음

### E5. Listener 예외 (원자성 경계 밖)
- [ ] emitter 리스너에서 throw해도 broker의 submitApproval()이 정상 완료됨 (예외 삼킴)
- [ ] broker가 best-effort emit 구간을 try/catch로 감싸서 리스너 예외를 삼킴 (caller에 전파하지 않음)
- 검증: unit test — listener에서 throw → submitApproval 정상 완료 (broker에 logger 의존 없으므로 로깅은 생략)
