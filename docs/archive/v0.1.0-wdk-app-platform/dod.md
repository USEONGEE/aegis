# DoD (Definition of Done) - v0.1.0

## 기능 완료 조건

### 보안 불변식 (PRD 목표 1~4)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | AI(OpenClaw)가 identity key 없이 SignedApproval을 생성하면 verifyApproval()이 UntrustedApproverError를 throw한다 | 단위 테스트: 유효하지 않은 approver로 submitApproval() 호출 → UntrustedApproverError |
| F2 | AI가 seed.txt(DB 파일)를 직접 읽을 수 없다 | 통합 테스트: unprivileged user로 `~/.wdk/store/wdk.db` 읽기 시도 → Permission denied |
| F3 | SignedApproval의 6단계 검증을 모두 통과해야만 tx가 실행된다 (REQUIRE_APPROVAL 시) | 단위 테스트: 각 단계별 실패 케이스 → 해당 에러 throw, Promise 미resolve |
| F4 | Relay 서버에서 control_channel payload를 복호화할 수 없다 | `packages/relay` 통합: Redis에 저장된 Stream entry를 직접 조회 → payload 필드가 암호문(Base64/hex)이고 평문 JSON이 아님. metadata(userId, messageId, timestamp)만 평문으로 존재 |
| F5 | 동일 intentId로 2회 이상 sendTransaction이 broadcast되지 않는다 | 통합 테스트: 같은 intentId로 2회 제출 → 2번째는 무시, broadcast 1회만 |

### Guarded WDK 확장 (PRD 목표 관련)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F6 | SignedApprovalBroker.createRequest()가 ApprovalRequest를 반환한다 | 단위 테스트 |
| F7 | SignedApprovalBroker.submitApproval()이 유효한 SignedApproval에 대해 Promise를 resolve한다 | 단위 테스트 |
| F8 | SignedApprovalBroker.submitApproval()이 무효한 SignedApproval에 대해 에러를 throw한다 (6종: UntrustedApproverError, DeviceRevokedError, SignatureError, ApprovalExpiredError, ReplayError, type별 검증 실패) | 단위 테스트: 6개 에러 각각 |
| F9 | SignedApprovalBroker.waitForApproval()이 타임아웃 시 ApprovalTimeoutError를 throw한다 | 단위 테스트: 60초 타임아웃 (mock timer) |
| F10 | nonce replay가 방지된다: 동일 approver+deviceId의 이전 nonce로 submitApproval 시 ReplayError | 단위 테스트 |
| F11 | cross-chain replay가 방지된다: chain 필드가 다르면 검증 실패 | 단위 테스트 |
| F12 | revoked 디바이스의 SignedApproval이 거부된다 | 단위 테스트: revokeDevice() 후 해당 deviceId로 submitApproval → DeviceRevokedError |
| F13 | policy 승인 시 WDK countersign이 수행된다 | 단위 테스트: type='policy' submitApproval 후 저장된 SignedPolicy에 wdkCounterSig 존재 |
| F14 | ApprovalStore (JSON 구현)이 load/save/loadPending/savePending/removePending/appendHistory/getHistory/saveDevice/getDevice/revokeDevice/getLastNonce/updateNonce 전부 동작한다 | 단위 테스트: 각 메서드 CRUD |
| F15 | ApprovalStore (SQLite 구현)이 동일한 인터페이스로 동작한다 | 단위 테스트: 각 메서드 CRUD |
| F16 | 다중 seed: addSeed/removeSeed/setActiveSeed/getActiveSeed/listSeeds가 동작한다 | 단위 테스트 |
| F17 | seed 전환 시 seed별 policy/pending/cron/journal이 분리된다 (seed_id FK) | 단위 테스트: seed A의 policy ≠ seed B의 policy |
| F18 | daemon 재시작 후 signed policy + pending + history + devices + nonces + seeds가 복구된다 | 통합 테스트: 저장 → 프로세스 재시작 시뮬레이션 → load 검증 |

### owner 원격 제어 (PRD 목표 5)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F19 | RN App에서 pending policy를 조회할 수 있다 | E2E 테스트: policy 요청 → 앱 Policy 탭에서 pending 목록 표시 |
| F20 | RN App에서 pending policy를 승인/거부할 수 있다 | E2E 테스트: 승인 → daemon에서 policy 적용 확인 / 거부 → pending에서 제거 |
| F21 | RN App에서 tx 승인 요청을 수신하고 승인/거부할 수 있다 | E2E 테스트: REQUIRE_APPROVAL tx → 앱 Approval 탭에 표시 → 승인 → tx 실행 |
| F22 | RN App에서 device revoke를 할 수 있다 | E2E 테스트: Settings에서 revoke → 해당 디바이스 서명 거부 확인 |

### AI ↔ WDK 연결 — 9개 Tool 각각 (PRD 목표 6, 9)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F23 | **sendTransaction** tool_call({ chain, to, data, value }) → AUTO → `{ status: 'executed', hash, fee, chain }` | `packages/daemon` 통합: mock WDK(AUTO) → tool result에 hash/fee 존재 |
| F24 | **sendTransaction** tool_call → REQUIRE_APPROVAL → `{ status: 'pending_approval', requestId }` | `packages/daemon` 통합: mock WDK(REQUIRE_APPROVAL) → status=pending_approval, requestId 존재 |
| F25 | **sendTransaction** tool_call → REJECT → `{ status: 'rejected', reason }` | `packages/daemon` 통합: mock WDK(REJECT) → status=rejected, reason 존재 |
| F26 | **transfer** tool_call({ chain, token, to, amount }) → WDK transfer 호출 → tool result 반환 | `packages/daemon` 통합: mock WDK → transfer 호출됨, result에 status 존재 |
| F27 | **getBalance** tool_call({ chain }) → `{ balances: [...] }` 반환 | `packages/daemon` 통합: mock WDK → getBalance 호출됨, balances 배열 반환 |
| F28 | **policyList** tool_call({ chain }) → `{ policies: [...] }` 반환 | `packages/daemon` 통합: mock store → 현재 active policy 반환 |
| F29 | **policyPending** tool_call({ chain }) → `{ pending: [...] }` 반환 | `packages/daemon` 통합: mock store → pending 목록 반환 |
| F30 | **policyRequest** tool_call({ chain, reason, policies }) → pending 저장 → `{ requestId, status: 'pending' }` | `packages/daemon` 통합: store에 pending 저장됨 + PendingPolicyRequested 이벤트 |
| F31 | **registerCron** tool_call({ interval, prompt, chain, sessionId }) → cron 등록 → `{ cronId, status: 'registered' }` | `packages/daemon` 통합: store에 cron 저장됨 |
| F32 | **listCrons** tool_call({}) → `{ crons: [...] }` 반환 | `packages/daemon` 통합: 등록된 cron 목록 반환 |
| F33 | **removeCron** tool_call({ cronId }) → cron 제거 → `{ status: 'removed' }` | `packages/daemon` 통합: store에서 cron 삭제됨 |

### Cron 실행 (PRD 목표 9)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F34 | 등록된 cron이 interval마다 OpenClaw에 prompt를 자동 전송한다 | `packages/daemon` 통합: mock timer로 interval 경과 → OpenClaw API POST 확인 |
| F35 | cron 삭제 후 자동 전송이 중단된다 | `packages/daemon` 통합: removeCron → 다음 interval에 API 미호출 |
| F36 | daemon 재시작 후 cron이 store에서 복구되어 자동 재등록된다 | `packages/daemon` 통합: 재시작 시뮬레이션 → cron 자동 실행 재개 |

### Relay + 통신 (PRD 목표 4, 8)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F37 | daemon이 outbound WebSocket으로 Relay에 연결한다 (포트 오픈 불필요) | `packages/relay` 통합: daemon WS client → Relay 연결 성공, 메시지 교환 |
| F38 | RN App이 Relay에 WebSocket(foreground) + REST로 연결한다 | `packages/relay` 통합: mock app client → WS + REST 양쪽 동작 |
| F39 | control_channel 메시지가 user 스코프로 전달된다 (세션 무관) | `packages/relay` 통합: 세션 생성 없이 control 메시지 → daemon 수신 |
| F40 | chat_queue 메시지가 session 스코프로 전달된다 | `packages/relay` 통합: session A 메시지 → session B에 미전달 |
| F41 | daemon WebSocket 끊김 시 exponential backoff로 재연결하고 누락 메시지를 수신한다 | `packages/daemon` 통합: WS 강제 끊기 → 재연결 → 큐에 보관된 메시지 수신 |
| F42 | daemon 오프라인 시 Relay가 메시지를 큐에 보관하고 온라인 시 전달한다 | `packages/relay` 통합: 메시지 적재 → daemon 연결 → 메시지 전달 확인 |
| F43 | Relay docker-compose (relay + redis + postgres)가 단일 명령으로 시작된다 | `docker-compose up -d` → `docker-compose ps` → 3개 서비스 healthy |

### PostgreSQL Registry (설계 결정)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F44 | pairing 시 devices 테이블에 device row가 생성된다 | `packages/relay` 통합: pairing API 호출 → `SELECT * FROM devices WHERE id = ?` → row 존재 |
| F45 | sessions 테이블에 session row가 생성된다 | `packages/relay` 통합: 세션 생성 → `SELECT * FROM sessions WHERE id = ?` → row 존재 |
| F46 | reconnect 시 registry lookup으로 올바른 daemon에 라우팅된다 | `packages/relay` 통합: daemon 재연결 → 기존 user의 메시지가 재연결된 WS로 전달 |
| F47 | registry 데이터가 Relay 재시작 후 유지된다 | `packages/relay` 통합: docker-compose restart → `SELECT` 쿼리 → 데이터 보존 |

### Manifest (PRD 목표 10)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F48 | getPolicyManifest(chainId)가 Manifest 규격에 맞는 JSON을 반환한다 | `packages/manifest` 단위: Aave manifest → 스키마 검증 통과 |
| F49 | manifestToPolicy(manifest, chainId, userConfig)가 유효한 Guarded WDK policy를 생성한다 | `packages/manifest` 단위: manifest → policy → evaluatePolicy(policy, chain, tx) → 매칭 성공 |

### Canonical Hash (설계 결정)

| # | 조건 | 검증 방법 |
|---|------|----------|
| F50 | packages/canonical의 intentHash가 PRD spec과 동일하게 동작한다 | `packages/canonical` 단위: 알려진 입력 { chain:'ethereum', to:'0xABC', data:'0xdef', value:'0' } → 알려진 SHA-256 해시 |
| F51 | packages/canonical의 policyHash가 PRD spec과 동일하게 동작한다 | `packages/canonical` 단위: 중첩 객체 + 비정렬 키 → sortKeysDeep 후 알려진 해시 |
| F52 | RN App(JS)과 daemon(Node.js)이 동일한 입력에 대해 동일한 intentHash/policyHash를 생성한다 | 크로스 환경 테스트: 테스트 벡터 파일 → 양쪽에서 실행 → 해시 일치 |

### E2E Pairing (설계 결정) — Phase 1 범위 축소

Phase 1은 핵심 구조 배치 + 단위 테스트. ECDH round-trip 통합 검증은 Phase 2.

| # | 조건 | 검증 방법 |
|---|------|----------|
| F53 | E2ECrypto 모듈이 ECDH 키 교환 + encrypt/decrypt를 제공한다 | 알고리즘 검증: tweetnacl ECDH/encrypt/decrypt/SAS round-trip 테스트 (app/tests/E2ECrypto.test.js) + 코드 검사: E2ECrypto.ts 클래스에 generateKeyPair/encrypt/decrypt/computeSAS 메서드 존재 |
| F54 | PairingService가 QR 코드 + SAS 검증 흐름을 구현한다 | 구조 검증: QR parsing/SAS/pairing_confirm payload 테스트 (app/tests/PairingService.test.js) + 코드 검사: PairingService.ts에 parseQRCode/initiatePairing/confirmPairing 메서드 존재 |
| F55 | daemon control-handler가 pairing_confirm 메시지를 처리하여 device를 store에 등록한다 | `packages/daemon` 단위: pairing_confirm mock 메시지 → store.saveDevice 호출 확인 |
| F56 | RelayClient (app + daemon)에 setSessionKey/encrypt/decrypt 메서드가 존재하고, sessionKey 설정 시 payload가 암호화된다 | 코드 검사: 메서드 존재 + 암호화 분기 로직 확인 |

---

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk: 기존 43개 테스트 + 신규 테스트 전부 통과 | `npm test -- packages/guarded-wdk` |
| N2 | guarded-wdk: ESLint(standard) 통과 | `npx standard packages/guarded-wdk/src/guarded/` |
| N3 | daemon: 테스트 전부 통과 | `npm test -- packages/daemon` |
| N4 | relay: 테스트 전부 통과 | `npm test -- packages/relay` |
| N5 | canonical: 테스트 전부 통과 | `npm test -- packages/canonical` |
| N6 | manifest: 테스트 전부 통과 | `npm test -- packages/manifest` |
| N7 | app: 빌드 성공 | `cd packages/app && npx expo export` |
| N8 | relay docker-compose: 3개 서비스 healthy | `docker-compose ps` |
| N9 | 모노레포 workspaces 설정 완료 | `npm install` (루트)에서 모든 패키지 의존성 해결 |

---

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | SignedApproval의 expiresAt이 과거인 경우 | ApprovalExpiredError | 단위 테스트 |
| E2 | 동일 nonce로 2번 submitApproval | 2번째에서 ReplayError | 단위 테스트 |
| E3 | ethereum 체인 대상 SignedApproval을 arbitrum에 적용 시도 | chain 불일치로 검증 실패 | 단위 테스트 |
| E4 | policy 승인 후 즉시 policy 교체, 이전 policy 기준 tx 승인 시도 | policyVersion 불일치로 거부 | 통합 테스트 |
| E5 | daemon 재시작 중 pending approval이 있는 경우 | 재시작 후 pending 복구, owner가 재승인 가능 | 통합 테스트 |
| E6 | Relay 장애 시 daemon의 독립 실행 | daemon의 AI + WDK는 로컬에서 계속 실행 (AUTO tx) | 통합 테스트 |
| E7 | 앱이 background일 때 approval 요청 | 푸시 알림으로 wake-up → 앱 foreground → WS 재연결 → approval 수신 | E2E 테스트 |
| E8 | seed 전환 후 이전 seed의 pending policy 조회 | 이전 seed의 pending은 보존되지만 현재 active seed의 것만 표시 | 단위 테스트 |
| E9 | cron이 실행 중 daemon 재시작 | 재시작 후 cron 재등록, lastRunAt 기반으로 중복 실행 방지 | 통합 테스트 |
| E10 | OpenClaw API 응답 없음 (타임아웃) | 3회 재시도 → 실패 시 사용자에게 에러 전달 | 통합 테스트 |
| E11 | 다중 디바이스에서 동시에 같은 pending policy 승인 | 먼저 도착한 승인이 적용, 두 번째는 nonce/requestId 검증으로 무시 | 통합 테스트 |
| E12 | malformed SignedApproval (필드 누락, 잘못된 타입) | verifyApproval 초기에 실패, 적절한 에러 | 단위 테스트 |
| E13 | intentHash의 입력이 대소문자 혼합된 address | canonical 정규화로 동일 해시 생성 | `packages/canonical` 단위: '0xAbC' → lowercase → 동일 해시 |
| E14 | SAS mismatch (MITM 시도) | pairing 중단, trustedApprovers에 등록 안 됨 | Phase 2 통합 테스트 (Phase 1: E2ECrypto SAS 계산 로직 단위 테스트) |
| E15 | QR 코드 변조 | 잘못된 QR → 연결 실패 또는 SAS 불일치 | Phase 2 E2E 테스트 (Phase 1: PairingService QR 파싱 단위 테스트) |
| E16 | Relay에 저장된 암호문을 탈취하여 재전송 | E2E 암호화 + nonce로 replay 방지 | Phase 2 통합 테스트 (Phase 1: RelayClient encrypt/decrypt 메서드 존재 확인) |

---

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| 1. AI는 policy/tx 승인 불가 | F1, F2, F3, F8 | ✅ |
| 2. identity key가 승인 루트 | F3, F7, F8, F53~F55 | ✅ |
| 3. Relay blind transport | F4, F56, E16 | ✅ |
| 4. 중복 실행 0건 | F5 | ✅ |
| 5. owner 원격 제어 | F19, F20, F21, F22 | ✅ |
| 6. AI → WDK tool (9개 각각) | F23~F33 | ✅ |
| 7. daemon 재시작 복구 | F18, F36 | ✅ |
| 8. NAT/방화벽 통과 | F37, F41, F42 | ✅ |
| 9. Cron | F31, F32, F33, F34, F35, F36 | ✅ |
| 10. Manifest → policy | F48, F49 | ✅ |

## 설계 결정 ↔ DoD 커버리지

| 설계 결정 | DoD 항목 | 커버 |
|----------|---------|------|
| Ed25519 서명/검증 | F3, F8, F11 | ✅ |
| SignedApprovalBroker | F6, F7, F8, F9, F10, F12, F13 | ✅ |
| ApprovalStore (JSON + SQLite) | F14, F15 | ✅ |
| 다중 seed | F16, F17, E8 | ✅ |
| Execution Journal | F5, E5, E9 | ✅ |
| packages/canonical | F50, F51, F52 | ✅ |
| Redis Streams 큐 | F39, F40, F41, F42 | ✅ |
| PostgreSQL 레지스트리 | F44, F45, F46, F47 | ✅ |
| docker-compose | F43, N8 | ✅ |
| daemon tool surface (9개 각각) | F23~F33 | ✅ |
| E2E pairing (SAS/QR) | F53, F54, F55, F56, E14, E15 | ✅ |
| HypurrQuant UI 패턴 | N7 (앱 빌드), F19~F22 (UI 기능) | ✅ |
