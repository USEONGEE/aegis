# 작업 티켓 - v0.1.0

## 전체 현황

| # | Step | 패키지 | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|--------|------|-------|-------|------|--------|
| 01 | canonical: sortKeysDeep + canonicalJSON | canonical | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | canonical: intentHash + policyHash | canonical | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | canonical: 테스트 벡터 + 크로스 플랫폼 검증 | canonical | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | guarded-wdk: 에러 클래스 확장 | guarded-wdk | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | guarded-wdk: ApprovalStore 추상 인터페이스 | guarded-wdk | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | guarded-wdk: JsonApprovalStore 구현 | guarded-wdk | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 07 | guarded-wdk: SqliteApprovalStore 구현 | guarded-wdk | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 08 | guarded-wdk: approval-verifier (6단계 검증) | guarded-wdk | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 09 | guarded-wdk: SignedApprovalBroker | guarded-wdk | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 10 | guarded-wdk: factory 확장 (store + trustedApprovers) | guarded-wdk | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 11 | guarded-wdk: middleware 마이그레이션 (broker 교체) | guarded-wdk | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 12 | guarded-wdk: 기존 테스트 마이그레이션 + 신규 테스트 | guarded-wdk | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 13 | manifest: 타입 정의 + getPolicyManifest 규격 | manifest | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 14 | manifest: manifestToPolicy 변환 + 테스트 | manifest | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 15 | daemon: 프로젝트 셋업 + config | daemon | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 16 | daemon: wdk-host (WDK 초기화 + seed 로드) | daemon | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 17 | daemon: tool-surface (9개 agent tool 정의) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 18 | daemon: openclaw-client (OpenAI SDK + session 매핑) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 19 | daemon: tool_call 실행 루프 (OpenClaw ↔ WDK) | daemon | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 20 | daemon: relay-client (outbound WS + 재연결) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 21 | daemon: control-handler (SignedApproval 수신 → WDK) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 22 | daemon: chat-handler (chat_queue ↔ OpenClaw) | daemon | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 23 | daemon: execution-journal (intentId dedupe) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 24 | daemon: cron-scheduler (등록 + 주기 실행 + 영속) | daemon | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 25 | daemon: admin-server (Unix socket + wdk-admin CLI) | daemon | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 26 | relay: 프로젝트 셋업 + docker-compose | relay | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 27 | relay: PostgreSQL 스키마 + registry adapter | relay | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 28 | relay: Redis Streams queue adapter | relay | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 29 | relay: WebSocket 서버 (daemon + app 연결) | relay | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 30 | relay: 인증 + 라우팅 (JWT + userId 매핑) | relay | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 31 | relay: 푸시 알림 (Expo Notifications) | relay | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 32 | relay: 통합 테스트 (큐 + 라우팅 + 재연결) | relay | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 33 | app: Expo 프로젝트 셋업 + 네비게이션 | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 34 | app: IdentityKeyManager (SecureStore) | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 35 | app: E2E 암호화 + PairingService (QR + SAS) | app | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 36 | app: RelayClient (WS + REST + 재연결) | app | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 37 | app: SignedApprovalBuilder (envelope 생성 + 서명) | app | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 38 | app: TxApprovalContext + TxApprovalSheet (HypurrQuant) | app | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 39 | app: Chat 탭 (OpenClaw 대화 UI) | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 40 | app: Policy 탭 (active + pending + manifest 기반 생성) | app | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 41 | app: Approval 탭 (tx 승인 대기 + 승인/거부) | app | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 42 | app: Activity 탭 (이벤트 타임라인) | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 43 | app: Dashboard 탭 (잔고 + 포지션) | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 44 | app: Settings 탭 (pairing + 디바이스 관리 + 알림) | app | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
Phase 1: Foundation
  01 → 02 → 03  (canonical)
  04 (errors, 독립)

Phase 2: Guarded WDK 확장
  03,04 → 05 → 06,07  (store 구현)
  03,04 → 08 → 09  (verifier → broker)
  06 or 07, 09 → 10 → 11 → 12  (factory + middleware + tests)

Phase 3: Manifest
  03 → 13 → 14  (manifest 규격)

Phase 4: Daemon
  10,14 → 15 → 16 → 17 → 18 → 19  (daemon core)
  19 → 20 → 21,22  (relay + handler)
  19 → 23  (journal)
  19 → 24  (cron)
  19 → 25  (admin)

Phase 5: Relay
  26 → 27,28 → 29 → 30 → 31 → 32  (relay stack)

Phase 6: RN App
  33 → 34 → 35  (identity + pairing)
  33 → 36  (relay client)
  34,36 → 37  (signed approval builder)
  37 → 38  (tx approval context)
  36 → 39  (chat)
  37 → 40,41  (policy, approval)
  36 → 42,43  (activity, dashboard)
  34,35,36,37 → 44  (settings: pairing+relay+approval+identity)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 1. AI는 policy/tx 승인 불가 | 08, 09, 11, 17, 34, 37 | ✅ |
| 2. identity key가 승인 루트 | 08, 09, 34, 37, 44 | ✅ |
| 3. Relay blind transport | 28, 29, 35, 36, 37 | ✅ |
| 4. 중복 실행 0건 | 23 | ✅ |
| 5. owner 원격 제어 | 38, 40, 41, 44 | ✅ |
| 6. AI → WDK tool (9개) | 17, 19 | ✅ |
| 7. daemon 재시작 복구 | 06/07, 10, 16, 23, 24 | ✅ |
| 8. NAT/방화벽 통과 | 20, 29 | ✅ |
| 9. Cron | 24 | ✅ |
| 10. Manifest → policy | 13, 14 | ✅ |

### DoD → 티켓 (핵심 항목)

| DoD | 관련 티켓 | 커버 |
|-----|----------|------|
| F1-F5 (보안 불변식) | 08, 09, 11, 23, 28, 29 | ✅ |
| F6-F13 (SignedApprovalBroker) | 08, 09 | ✅ |
| F14-F15 (ApprovalStore) | 06, 07 | ✅ |
| F16-F18 (다중 seed + 복구) | 05, 06, 07, 16 | ✅ |
| F19-F22 (owner 원격) | 38, 40, 41, 44 | ✅ |
| F23-F33 (9개 tool) | 17, 19 | ✅ |
| F34-F36 (cron 실행) | 24 | ✅ |
| F37-F43 (relay + 통신) | 20, 28, 29, 30, 32 | ✅ |
| F44-F47 (PG registry) | 27, 30 | ✅ |
| F48-F49 (manifest) | 13, 14 | ✅ |
| F50-F52 (canonical hash) | 01, 02, 03 | ✅ |
| F53-F56 (E2E pairing) | 34, 35, 36 | ✅ |
| N1 (guarded-wdk 테스트) | 12 | ✅ |
| N2 (guarded-wdk 린트) | 12 | ✅ |
| N3 (daemon 테스트) | 19, 23, 24 | ✅ |
| N4 (relay 테스트) | 32 | ✅ |
| N5 (canonical 테스트) | 03 | ✅ |
| N6 (manifest 테스트) | 14 | ✅ |
| N7 (app 빌드) | 33 | ✅ |
| N8 (docker-compose) | 26 | ✅ |
| N9 (workspaces 설정) | 01, 15, 26, 33 | ✅ |
| E1-E16 (엣지케이스) | 08, 09, 12, 23, 24, 32, 35 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| Ed25519 (tweetnacl) | 08, 37 | ✅ |
| SignedApprovalBroker | 09, 11 | ✅ |
| ApprovalStore (JSON + SQLite) | 05, 06, 07 | ✅ |
| 다중 seed (seed_id FK) | 05, 06, 07, 16 | ✅ |
| Execution Journal | 23 | ✅ |
| packages/canonical | 01, 02, 03 | ✅ |
| Redis Streams | 28 | ✅ |
| PostgreSQL registry | 27 | ✅ |
| docker-compose | 26 | ✅ |
| daemon tool surface (9개) | 17, 19 | ✅ |
| E2E pairing (SAS/QR) | 35 | ✅ |
| HypurrQuant UI 패턴 | 33, 38 | ✅ |
| OpenClaw SDK (function calling) | 18, 19 | ✅ |
| Cron Scheduler | 24 | ✅ |
| Admin surface (wdk-admin) | 25 | ✅ |
| 푸시 알림 (Expo Push) | 31 | ✅ |

### Orphan Ticket Audit

매트릭스에 한 번도 등장하지 않는 Step이 없는지 확인:

| Step | 매트릭스 등장 | 근거 |
|------|-------------|------|
| 01 | N9 | workspaces 설정 |
| 02 | F50-F52 | canonical hash |
| 03 | N5, F50-F52 | canonical 테스트 |
| 04 | 설계: errors | 에러 확장 |
| 05 | 설계: ApprovalStore | 인터페이스 |
| 06 | F14, 설계: ApprovalStore | JSON 구현 |
| 07 | F15, 설계: ApprovalStore | SQLite 구현 |
| 08 | F1, F3, F6-F13, 설계: Ed25519/verifier | 핵심 검증 |
| 09 | F6-F13, 설계: SignedApprovalBroker | 핵심 broker |
| 10 | 설계: factory | factory 확장 |
| 11 | F1-F5, 설계: broker 교체 | middleware |
| 12 | N1, N2 | 테스트 |
| 13 | F48, 설계: manifest | manifest 타입 |
| 14 | F49, N6 | manifest 변환 |
| 15 | N9 | daemon 셋업 |
| 16 | 목표 7, 설계: 다중 seed | WDK 초기화 |
| 17 | 목표 6, F23-F33 | tool surface |
| 18 | 설계: OpenClaw SDK | OpenClaw client |
| 19 | 목표 6, F23-F33, N3 | tool_call 루프 |
| 20 | 목표 8 | relay client |
| 21 | 설계: control handler | control 처리 |
| 22 | 설계: chat handler | chat 처리 |
| 23 | 목표 4, F5, N3 | execution journal |
| 24 | 목표 9, F34-F36, N3 | cron |
| 25 | 설계: admin surface | admin server |
| 26 | N8, N9, 설계: docker-compose | relay 셋업 |
| 27 | F44-F47, 설계: PG registry | PostgreSQL |
| 28 | F1-F5, F37-F43, 목표 3, 설계: Redis | Redis queue |
| 29 | 목표 3, 목표 8, F37-F43 | WS 서버 |
| 30 | F44-F47 | 인증/라우팅 |
| 31 | 설계: 푸시 알림 | push |
| 32 | N4, F37-F43 | relay 통합 테스트 |
| 33 | N7, N9, 설계: HypurrQuant | app 셋업 |
| 34 | 목표 1, 목표 2, F53-F56 | identity key |
| 35 | 목표 3, F53-F56, E14-E15 | E2E pairing |
| 36 | 목표 3, F53-F56 | relay client |
| 37 | 목표 1, 목표 2, 설계: Ed25519 | signed approval |
| 38 | 목표 5, 설계: HypurrQuant | tx approval UI |
| 39 | 설계: chat | chat 탭 |
| 40 | 목표 5, F19-F20 | policy 탭 |
| 41 | 목표 5, F21 | approval 탭 |
| 42 | 설계: activity | activity 탭 |
| 43 | 설계: dashboard | dashboard 탭 |
| 44 | 목표 5, F22, 설계: settings | settings 탭 |

**Orphan 없음**: 44개 Step 전부 매트릭스에 최소 1회 등장.

## Step 상세

- [Step 01: canonical - sortKeysDeep + canonicalJSON](step-01-canonical-core.md)
- [Step 02: canonical - intentHash + policyHash](step-02-canonical-hash.md)
- [Step 03: canonical - 테스트 벡터](step-03-canonical-test-vectors.md)
- [Step 04: guarded-wdk - 에러 클래스 확장](step-04-errors.md)
- [Step 05: guarded-wdk - ApprovalStore 인터페이스](step-05-approval-store-interface.md)
- [Step 06: guarded-wdk - JsonApprovalStore](step-06-json-approval-store.md)
- [Step 07: guarded-wdk - SqliteApprovalStore](step-07-sqlite-approval-store.md)
- [Step 08: guarded-wdk - approval-verifier](step-08-approval-verifier.md)
- [Step 09: guarded-wdk - SignedApprovalBroker](step-09-signed-approval-broker.md)
- [Step 10: guarded-wdk - factory 확장](step-10-factory-extension.md)
- [Step 11: guarded-wdk - middleware 마이그레이션](step-11-middleware-migration.md)
- [Step 12: guarded-wdk - 테스트 마이그레이션](step-12-test-migration.md)
- [Step 13: manifest - 타입 + 규격](step-13-manifest-types.md)
- [Step 14: manifest - manifestToPolicy](step-14-manifest-to-policy.md)
- [Step 15: daemon - 프로젝트 셋업](step-15-daemon-setup.md)
- [Step 16: daemon - wdk-host](step-16-wdk-host.md)
- [Step 17: daemon - tool-surface](step-17-tool-surface.md)
- [Step 18: daemon - openclaw-client](step-18-openclaw-client.md)
- [Step 19: daemon - tool_call 실행 루프](step-19-tool-call-loop.md)
- [Step 20: daemon - relay-client](step-20-relay-client.md)
- [Step 21: daemon - control-handler](step-21-control-handler.md)
- [Step 22: daemon - chat-handler](step-22-chat-handler.md)
- [Step 23: daemon - execution-journal](step-23-execution-journal.md)
- [Step 24: daemon - cron-scheduler](step-24-cron-scheduler.md)
- [Step 25: daemon - admin-server](step-25-admin-server.md)
- [Step 26: relay - 프로젝트 셋업 + docker-compose](step-26-relay-setup.md)
- [Step 27: relay - PostgreSQL + registry](step-27-pg-registry.md)
- [Step 28: relay - Redis Streams queue](step-28-redis-queue.md)
- [Step 29: relay - WebSocket 서버](step-29-ws-server.md)
- [Step 30: relay - 인증 + 라우팅](step-30-auth-routing.md)
- [Step 31: relay - 푸시 알림](step-31-push-notifications.md)
- [Step 32: relay - 통합 테스트](step-32-relay-integration-tests.md)
- [Step 33: app - Expo 셋업 + 네비게이션](step-33-app-setup.md)
- [Step 34: app - IdentityKeyManager](step-34-identity-key.md)
- [Step 35: app - E2E 암호화 + Pairing](step-35-e2e-pairing.md)
- [Step 36: app - RelayClient](step-36-relay-client.md)
- [Step 37: app - SignedApprovalBuilder](step-37-signed-approval-builder.md)
- [Step 38: app - TxApprovalContext + Sheet](step-38-tx-approval-ui.md)
- [Step 39: app - Chat 탭](step-39-chat-tab.md)
- [Step 40: app - Policy 탭](step-40-policy-tab.md)
- [Step 41: app - Approval 탭](step-41-approval-tab.md)
- [Step 42: app - Activity 탭](step-42-activity-tab.md)
- [Step 43: app - Dashboard 탭](step-43-dashboard-tab.md)
- [Step 44: app - Settings 탭](step-44-settings-tab.md)
