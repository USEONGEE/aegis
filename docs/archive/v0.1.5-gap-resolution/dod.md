# DoD (Definition of Done) - v0.1.5

## 기능 완료 조건

### Critical

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | app SignedApprovalBuilder가 SHA-256 해시에 Ed25519 서명한다 | `packages/app` 단위: builder → sig → verifier 통과 round-trip |
| F2 | control-handler가 tx_approval 시 expectedTargetHash + currentPolicyVersion을 context로 전달한다 | `packages/daemon` 단위: mock broker.submitApproval 호출 시 context 존재 확인 |
| F3 | daemon이 pairing_confirm에서 pairingToken을 검증하는 코드가 존재한다 | 코드 검사: control-handler.ts에 token/SAS 검증 로직 존재 |
| F4 | pairing 검증 분기 코드(token/SAS/ECDH)가 control-handler에 존재. PairingSession 생성 + app JWT 획득은 Phase 2 | 코드 검사: 검증 분기 존재 + PROGRESS에 Phase 2 이관 명시 |
| F4b | daemon이 pairing_confirm에서 SAS 검증 코드가 존재한다 | 코드 검사: SAS mismatch 시 거부 분기 존재 |
| F5 | app executor가 request.type에 따라 forTx/forPolicy/forPolicyReject/forDeviceRevoke를 분기한다 | `packages/app` 단위: 각 type별 builder 호출 확인 |
| F6 | pairing 완료 후 setSessionKey() 호출 코드가 존재한다 (E2E round-trip은 Phase 2) | 코드 검사: control-handler + PairingService에 ECDH → setSessionKey 코드 경로 존재 |

### High

| # | 조건 | 검증 방법 |
|---|------|----------|
| F7 | daemon이 policy_approval/device_revoke 결과를 relay로 전송한다 | `packages/daemon` 단위: handleControlMessage 후 relay.send 호출 확인 |
| F8 | daemon이 WDK 이벤트를 relay control channel로 forward한다 | `packages/daemon` 단위: wdk emit → relay.send('control', event_stream) 확인 |
| F9 | daemon boot 시 store에서 policy를 로드하여 WDK에 반영한다 | `packages/daemon` 단위: store에 policy 저장 → 재시작 시뮬 → evaluatePolicy 매칭 |
| F10 | Dashboard가 event_stream + chat(getBalance) 결과를 zustand에 normalize. Settings가 chat(device list) 결과를 zustand에 normalize. 별도 control 타입 없음 | `packages/app` 코드 검사: DashboardScreen/SettingsScreen이 request_balances/device_list control 의존 제거 + zustand 사용 |

### Medium

| # | 조건 | 검증 방법 |
|---|------|----------|
| F11 | daemon이 authenticate 시 lastStreamId를 전송한다 | `packages/daemon` 코드 검사: relay-client.ts connect 시 lastStreamId 포함 |
| F12 | Relay가 lastStreamId부터 stream을 읽는다 | `packages/relay` 코드 검사: ws.ts polling에서 lastStreamId 사용 |
| F13 | daemon 기본 store가 SqliteApprovalStore이다 | `packages/daemon` 코드 검사: wdk-host.ts에서 SqliteApprovalStore 사용 |
| F14 | manifest PolicyPermission이 WDK Permission 필드명과 일치한다 | `packages/manifest` 단위: manifestToPolicy 출력이 evaluatePolicy와 호환 |
| F15 | system-interaction-cases.md의 journal 서술이 실제 API와 일치한다 | 문서 검사: journal.track → 'received', updateStatus → 'settled' |
| F16 | ChatScreen이 typing/stream/error 메시지를 처리한다 | `packages/app` 코드 검사: 3가지 타입 핸들러 존재 |
| F17 | DB 파일 + admin socket에 chmod 600이 설정된다 | `packages/guarded-wdk` + `packages/daemon` 코드 검사: chmodSync(path, 0o600) 호출 |
| F18 | system-interaction-cases.md에 6개 tool 케이스가 추가된다 | 문서 검사: transfer, getBalance, policyList, policyPending, listCrons, removeCron |

### Low

| # | 조건 | 검증 방법 |
|---|------|----------|
| F19 | policy_reject 시 ApprovalRejected 이벤트가 emit된다 | `packages/guarded-wdk` 단위: policy_reject submitApproval → 이벤트 수신 |

### 추가

| # | 조건 | 검증 방법 |
|---|------|----------|
| F20 | ApprovalStore가 policy의 단일 source of truth이다 | `packages/guarded-wdk` 단위: boot hydrate + write-through 동작 확인 |
| F21 | createGuardedWDK()의 policies 파라미터가 optional이다 (store가 비어있을 때만 사용) | 코드 검사: policies가 optional 타입 + store 우선 로직 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | app이 SHA-256 해시 대신 원문으로 서명 | verifier에서 SignatureError | 단위 테스트 |
| E2 | context의 expectedTargetHash가 approval의 targetHash와 다름 | verifier step 6에서 실패 | 단위 테스트 |
| E3 | pairingToken이 잘못됨 | daemon이 pairing 거부 | 단위 테스트 |
| E4 | SAS 값 불일치 | daemon이 pairing 거부 | 단위 테스트 |
| E5 | E2E 세션 미수립 상태에서 메시지 전송 | 평문 전송 (fallback) | 코드 검사 |
| E6 | store에 policy가 없는 상태에서 boot | config의 optional policies 사용 | 단위 테스트 |
| E7 | reconnect 시 lastStreamId가 만료된 경우 | Relay가 '$'부터 시작 (fallback) | 코드 검사 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 기존 테스트 전부 통과 | `npm test` |
| N2 | CI 체크 7개 PASS | `npx tsx scripts/check/index.ts` → 7/7 |
| N3 | Gap별 새 테스트 추가 (Critical 5개 최소) | 테스트 파일 존재 확인 |

## PRD 목표 ↔ DoD 커버리지

| PRD step | DoD | 커버 |
|----------|-----|------|
| 1 (서명 통일) | F1 | ✅ |
| 2 (context 전달) | F2 | ✅ |
| 3 (pairing 보안) | F3, F4, F4b | ✅ |
| 4 (executor 분기) | F5 | ✅ |
| 5 (E2E 세션) | F6 | ✅ |
| 6 (approval ack) | F7 | ✅ |
| 7 (이벤트 relay) | F8 | ✅ |
| 8 (policy restore) | F9 | ✅ |
| 9 (device/balance) | F10 | ✅ |
| 10 (reconnect) | F11, F12 | ✅ |
| 11 (SqliteStore) | F13 | ✅ |
| 12 (manifest schema) | F14 | ✅ |
| 13 (journal 문서) | F15 | ✅ |
| 14 (chat streaming) | F16 | ✅ |
| 15 (chmod) | F17 | ✅ |
| 16 (tool 문서화) | F18 | ✅ |
| 17 (ApprovalRejected) | F19 | ✅ |
| 18 (ChainPolicies) | F20, F21 | ✅ |
