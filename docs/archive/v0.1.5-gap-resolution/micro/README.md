# 작업 티켓 - v0.1.5

## 전체 현황

| # | Step | Gap | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|-----|--------|------|-------|-------|------|--------|
| 01 | 서명 방식 통일 | 1 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | approval context 전달 | 2 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 03 | pairing 보안 | 3+16 | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 04 | app executor type 분기 | 10 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 05 | E2E 세션 수립 | 11 | 🔴 | ✅ | ✅ | ✅ | ⏳ | - |
| 06 | approval ack | 4+22 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 07 | WDK 이벤트 relay | 5+14 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 08 | stored policy restore | 17 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 09 | device list + balance + position | 18+19 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 10 | reconnect cursor | 6 | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |
| 11 | SqliteStore 기본값 | 7 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 12 | manifest schema 정합 | 9 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 13 | journal API 정합 | 13 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 14 | chat streaming 소비 | 20 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 15 | chmod 600 | 21 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 16 | tool 케이스 문서화 | 8 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 17 | ApprovalRejected 이벤트 | 15 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 18 | ChainPolicies store 통합 | — | 🟠 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
Critical (순서 중요):
  01 → 02  (서명 맞춰야 context 검증 의미)
  03 → 05  (pairing 수정 후 E2E)
  04 → 06  (type 분기 후 ack)

High:
  07 → 09  (이벤트 relay 후 Dashboard/Settings 갱신)
  02 → 08  (store API 추가 후 restore)

Medium (대부분 독립):
  10, 11, 12, 13, 14, 15, 16, 17 — 서로 독립

추가:
  08 → 18  (policy restore 후 캐시 통합)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD step | 관련 티켓 | 커버 |
|----------|----------|------|
| 1 (서명 통일) | 01 | ✅ |
| 2 (context 전달) | 02 | ✅ |
| 3 (pairing 보안) | 03 | ✅ |
| 4 (executor 분기) | 04 | ✅ |
| 5 (E2E 세션) | 05 | ✅ |
| 6 (approval ack) | 06 | ✅ |
| 7 (이벤트 relay) | 07 | ✅ |
| 8 (policy restore) | 08 | ✅ |
| 9 (device/balance/position) | 09 | ✅ |
| 10 (reconnect) | 10 | ✅ |
| 11 (SqliteStore) | 11 | ✅ |
| 12 (manifest schema) | 12 | ✅ |
| 13 (journal 문서) | 13 | ✅ |
| 14 (chat streaming) | 14 | ✅ |
| 15 (chmod) | 15 | ✅ |
| 16 (tool 문서화) | 16 | ✅ |
| 17 (ApprovalRejected) | 17 | ✅ |
| 18 (ChainPolicies) | 18 | ✅ |

### DoD → 티켓

| DoD | 관련 티켓 | 커버 |
|-----|----------|------|
| F1 | 01 | ✅ |
| F2 | 02 | ✅ |
| F3, F4, F4b | 03 | ✅ |
| F5 | 04 | ✅ |
| F6 | 05 | ✅ |
| F7 | 06 | ✅ |
| F8 | 07 | ✅ |
| F9 | 08 | ✅ |
| F10 | 09 | ✅ |
| F11, F12 | 10 | ✅ |
| F13 | 11 | ✅ |
| F14 | 12 | ✅ |
| F15 | 13 | ✅ |
| F16 | 14 | ✅ |
| F17 | 15 | ✅ |
| F18 | 16 | ✅ |
| F19 | 17 | ✅ |
| F20, F21 | 18 | ✅ |
| N1, N2, N3 | 전체 | ✅ |
| E1~E7 | 01, 02, 03, 05, 10, 18 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| SHA-256 해시 서명 (표준) | 01 | ✅ |
| context를 서버 측 pending에서 (client 재사용 금지) | 02 | ✅ |
| 새 store API: loadPendingByRequestId | 02 | ✅ |
| 새 store API: listPolicyChains | 08 | ✅ |
| 12종 이벤트명 배열 등록 | 07 | ✅ |
| Dashboard/Settings: event_stream + chat → zustand normalize | 09 | ✅ |
| SqliteStore 기본값 + JsonStore 테스트용 | 11 | ✅ |
| ChainPolicies: store = source of truth, policies optional | 18 | ✅ |
| WDK 이벤트 그대로 relay (primitive) | 07 | ✅ |
| 데이터 조회: AI tool (primitive) | 09 | ✅ |

## Step 상세

- [Step 01: 서명 방식 통일](step-01-signature-unify.md)
- [Step 02: approval context 전달](step-02-approval-context.md)
- [Step 03: pairing 보안](step-03-pairing-security.md)
- [Step 04: executor type 분기](step-04-executor-type-branch.md)
- [Step 05: E2E 세션 수립](step-05-e2e-session.md)
- [Step 06: approval ack](step-06-approval-ack.md)
- [Step 07: WDK 이벤트 relay](step-07-event-relay.md)
- [Step 08: stored policy restore](step-08-policy-restore.md)
- [Step 09: device list + balance + position](step-09-data-via-chat.md)
- [Step 10: reconnect cursor](step-10-reconnect-cursor.md)
- [Step 11: SqliteStore 기본값](step-11-sqlite-default.md)
- [Step 12: manifest schema 정합](step-12-manifest-schema.md)
- [Step 13: journal API 정합](step-13-journal-docs.md)
- [Step 14: chat streaming 소비](step-14-chat-streaming.md)
- [Step 15: chmod 600](step-15-chmod.md)
- [Step 16: tool 케이스 문서화](step-16-tool-docs.md)
- [Step 17: ApprovalRejected 이벤트](step-17-approval-rejected-event.md)
- [Step 18: ChainPolicies store 통합](step-18-chain-policies-integration.md)

## 참고
- Step 5 (개발)는 v0.1.4 완료 후 진행
- 각 step의 상세 구현/완료 조건은 design.md의 해당 Step 섹션 참조
