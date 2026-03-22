# 티켓 현황 - v0.4.4

## 전체 진행 상황

| Step | 설명 | 난이도 | 상태 | 선행 |
|------|------|--------|------|------|
| 01 | [sendApproval() 이벤트 전환](step-01-send-approval-event.md) | 🟠 중간 | ⏳ 대기 | 없음 |
| 02 | [eventName → event.type](step-02-eventname-migration.md) | 🟢 쉬움 | ⏳ 대기 | 01 |
| 03 | [Activity Store 적재](step-03-activity-ingest.md) | 🟢 쉬움 | ⏳ 대기 | 02 |

## 커버리지 매트릭스

| DoD | 티켓 |
|-----|------|
| F1: sendApproval 이벤트 전환 + 반환값 유지 + 수동 테스트 | Step 01 |
| F2: eventName→event.type + grep 확인 | Step 02 |
| F3: activity 적재 + ApprovalFailed 타입 + tsc | Step 03 |
| NF1: tsc 통과 | Step 01~03 (각 step에서 확인) |

### PRD 목표 → 티켓

| PRD 목표 | 티켓 |
|---------|------|
| 1. sendApproval 이벤트 전환 | Step 01 |
| 2. 반환값 유지 | Step 01 |
| 3. eventName→event.type | Step 02 |
| 4. Activity 이벤트 기록 | Step 03 |

### 설계 결정 → 티켓

| 설계 결정 | 티켓 |
|-----------|------|
| sendApproval 내부 event_stream 필터링 | Step 01 |
| 화면별 listener 유지 | Step 02 |
| RootNavigator activity dispatch | Step 03 |
| ApprovalFailed activity 추가 | Step 03 |

커버리지: PRD 4/4, DoD F1~F3 + NF1, 설계 4/4 전체 ✅
