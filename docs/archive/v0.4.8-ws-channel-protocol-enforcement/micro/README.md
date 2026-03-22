# 작업 티켓 - v0.4.8

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | control 단방향화 + event_stream 분리 | 🟠 | ✅ | ✅ | ✅ | ✅ | 2026-03-22 |
| 02 | relay 이중 전달 제거 + event_stream 변환 + app 소비자 | 🟠 | ✅ | ✅ | ✅ | ✅ | 2026-03-22 |
| 03 | query/query_result 채널 추가 | 🔴 | ✅ | ✅ | ✅ | ✅ | 2026-03-22 |
| 04 | protocol 타입 강제 적용 | 🟠 | ✅ | ✅ | ✅ | ✅ | 2026-03-22 |

## 의존성

```
01 → 02 (relay는 event_stream 분리 후 변환)
01 → 03 (query는 protocol 타입 기반)
01 → 04 (타입 강제는 채널 구조 확정 후)
03 → 04 (query_result 오버로드는 query 타입 정의 후)
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 채널 단방향 통일 | Step 01 (ControlEvent/ControlResult 해체, 모든 daemon→app을 event_stream으로) + Step 02 (app 소비자 전환) | ✅ |
| 단일 전달 경로 | Step 02 (relay 직접 forward 제거) | ✅ |
| query 채널 신설 | Step 03 (protocol+relay+daemon+app) | ✅ |
| protocol 타입 강제 | Step 04 (send() 오버로드+타입 적용) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1 cancel→CancelCompleted/CancelFailed | Step 01 | ✅ |
| F2 ControlResult 제거 | Step 01 | ✅ |
| F3 index.ts event_stream 전송 | Step 01 | ✅ |
| F4 직접 forward 제거 | Step 02 | ✅ |
| F5 poller event_stream 변환 | Step 02 | ✅ |
| F6 QueryType/QueryMessage/QueryResult | Step 03 | ✅ |
| F7 query Redis 미경유 | Step 03 | ✅ |
| F8 daemon_offline 에러 | Step 03 | ✅ |
| F9 query-handler 4종 | Step 03 | ✅ |
| F10 app query() 메서드 | Step 03 | ✅ |
| F11 send() 오버로드 | Step 04 | ✅ |
| F12 ChatEvent import | Step 04 | ✅ |
| F13 EventStreamPayload 독립 | Step 01 | ✅ |
| F14 RelayChannel 5종 | Step 03 | ✅ |
| F15 relay protocol 타입 | Step 04 | ✅ |
| F16 app typed handling | Step 04 | ✅ |
| F17 query_result E2E 암호화 | Step 04 | ✅ |
| N1 tsc --noEmit 전 패키지 | Step 04 | ✅ |
| N2 기존 테스트 통과 | Step 01~04 (매 step) | ✅ |
| N3 compile-fail fixture | Step 04 | ✅ |
| E1 daemon offline query | Step 03 | ✅ |
| E2 query timeout | Step 03 | ✅ |
| E3 cancel not_found | Step 01 | ✅ |
| E4 poller 실시간성 | Step 02 (검증 완료) | ✅ |
| E5 query_result 암호화 | Step 04 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| CancelCompleted/CancelFailed events.ts | Step 01 | ✅ |
| query.ts 신규 | Step 03 | ✅ |
| RelayChannel 확장 | Step 03 | ✅ |
| event_stream top-level 승격 | Step 01 + Step 02 | ✅ |
| query WS 직접 전달 | Step 03 | ✅ |
| send() 오버로드 | Step 04 | ✅ |
| query_result ok\|error DU | Step 03 | ✅ |
| daemon_offline 평문 예외 | Step 03 | ✅ |
| daemon query_result E2E 암호화 | Step 04 | ✅ |
| relay wire↔protocol 변환 | Step 04 | ✅ |
| app protocol 타입 적용 | Step 04 | ✅ |

## Step 상세
- [Step 01: control 단방향화 + event_stream 분리](step-01-cancel-event-stream.md)
- [Step 02: relay 이중 전달 제거 + event_stream 변환 + app 소비자](step-02-relay-cleanup.md)
- [Step 03: query/query_result 채널 추가](step-03-query-channel.md)
- [Step 04: protocol 타입 강제 적용](step-04-type-enforcement.md)
