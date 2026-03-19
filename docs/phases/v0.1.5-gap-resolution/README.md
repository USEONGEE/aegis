# Gap 해소 + ChainPolicies 통합 - v0.1.5

## 문제 정의

### 현상
v0.1.0~v0.1.3 구현에서 Codex 5회 검증으로 발견된 22개 Gap이 미해결. 설계 의도와 실제 코드 사이의 불일치가 보안/기능/UX 전반에 존재.

추가로 `ChainPolicies` 타입이 `ApprovalStore`와 별도로 런타임 메모리 캐시를 관리하여 이중 관리 구조.

### 원인
- v0.1.0에서 기능 구현 우선, cross-package 계약 정합성 후순위
- 병렬 agent 구현으로 패키지 간 인터페이스 불일치 발생
- pairing/E2E/reconnect 같은 복잡한 흐름이 구조만 배치되고 연결 안 됨

### 영향
- **보안**: 서명 방식 불일치로 승인 검증 실패 (Gap 1), pairing 보안 미검증 (Gap 3, 16), E2E 미수립 (Gap 11)
- **기능**: approval ack 없음 (Gap 4, 22), pending 알림 없음 (Gap 5), policy restore 안 됨 (Gap 17)
- **UX**: device list/balance 조회 불가 (Gap 18, 19), chat streaming 안 됨 (Gap 20)
- **운영**: chmod 미설정 (Gap 21), reconnect cursor 없음 (Gap 6)

### 목표

18개 micro step으로 분할 (v0.1.4 완료 후 진행):

**Critical (5 step)**:
1. 서명 방식 통일 — app이 SHA-256 해시에 서명하도록 수정 (Gap 1)
2. approval context 전달 — control-handler에서 expectedTargetHash + policyVersion 전달 (Gap 2)
3. pairing 보안 — pairingToken/sas 검증 + JWT 흐름 수정 (Gap 3+16)
4. app executor type 분기 — forTx/forPolicy/forDeviceRevoke 분기 (Gap 10)
5. E2E 세션 수립 — ECDH shared secret → setSessionKey 호출 연결 (Gap 11)

**High (4 step)**:
6. approval ack — daemon이 policy/device 결과도 relay로 전송 (Gap 4+22)
7. WDK 이벤트 relay — emitter 설정 + 이벤트를 relay.send (Gap 5+14)
8. stored policy restore — daemon boot 시 wallet map + policy 로드 (Gap 17)
9. device list + balance + position — AI tool로 조회, primitive 방식 (Gap 18+19). 잔고와 DeFi 포지션 모두 포함

**Medium (7 step)**:
10. reconnect cursor — lastStreamId 전달 + Relay가 읽기 (Gap 6)
11. SqliteStore 기본값 — daemon 기본 store 전환 (Gap 7)
12. manifest schema 정합 — PolicyPermission ↔ Permission 맞추기 (Gap 9)
13. journal API 정합 — 문서 vs 코드 일치 (Gap 13)
14. chat streaming 소비 — app이 typing/stream/error 처리 (Gap 20)
15. chmod 600 — DB + admin socket permission 설정 (Gap 21)
16. 나머지 tool 케이스 문서화 (Gap 8)

**Low (1 step)**:
17. ApprovalRejected 이벤트 추가 (Gap 15)

**추가 (1 step)**:
18. ChainPolicies → store 캐시 통합. **ApprovalStore가 policy의 단일 source of truth.** boot 시 store.loadPolicy()로 hydrate → 런타임 메모리 캐시. updatePolicies() 시 store.savePolicy() write-through → 메모리 갱신. ChainPolicies 타입은 내부 캐시로만 유지, createGuardedWDK()의 policies 파라미터는 optional로 격하 (store가 비어있을 때만 사용)

### 비목표 (Out of Scope)
- v0.1.4 범위 (8개 타입 리팩토링) — 별도 Phase로 선행
- 새로운 기능 추가 (이미 설계된 것의 구현만)
- on-chain policy
- DeFi CLI 구현

## 제약사항
- **v0.1.4 완료 후 진행** — chainId 통일, permissions 딕셔너리 등이 먼저 반영되어야 Gap 수정이 정확
- 기존 테스트 유지 + Gap별 새 테스트 추가
- breaking change 허용 (내부 인터페이스)
- 저장 포맷 reset 허용 (프로덕션 데이터 없음)
- WDK 이벤트 relay = primitive 방식 (이벤트 그대로 forward). 별도 프로토콜 정의 안 함
- device list / balance = AI tool로 조회 (별도 control 메시지 타입 안 만듦)

## 참조
- **Gap 분석**: `docs/report/system-interaction-cases.md` (22개 Gap + 보안 경계 현황)
- **아키텍처**: `docs/report/architecture-and-user-flow-summary.md`
- **PRD**: `docs/PRD.md`
- **v0.1.4 인수인계**: `docs/phases/v0.1.4-type-refactoring/HANDOVER.md`

## 사용자 확정 결정사항
- Gap 1 서명 방식: **app이 SHA-256 해시에 서명** (암호학 표준, Ethereum 패턴)
- Gap 7 Store: **SqliteStore 기본값 + JsonStore는 테스트/개발용 유지**
- Gap 5+18+19 이벤트/데이터: **WDK 이벤트 그대로 relay (primitive). 데이터 조회는 AI tool**
- Gap 12 countersign: **제거** (v0.1.4에서 처리)
