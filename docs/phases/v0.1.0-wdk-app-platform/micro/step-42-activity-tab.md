# Step 42: app - Activity 탭

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 36 (RelayClient)

---

## 1. 구현 내용 (design.md + PRD 기반)

Activity 탭 — 이벤트 타임라인 (WDK 11종 이벤트) + 타입별 필터 + 실시간 WebSocket 업데이트.

- `src/domains/activity/screens/ActivityScreen.tsx`: Activity 탭 메인 화면
- `src/stores/useActivityStore.ts`: zustand 이벤트 상태

**이벤트 타임라인 (11 event types from WDK)**:

WDK 기존 7종:
| 이벤트 | 설명 |
|--------|------|
| IntentProposed | tx intent 제출 |
| PolicyEvaluated | policy 평가 완료 (AUTO/REQUIRE_APPROVAL/REJECT) |
| ExecutionBroadcasted | tx 온체인 전송 |
| ExecutionSettled | tx 확정 |
| ExecutionFailed | tx 실패 |
| PolicyChanged | policy 변경 (런타임) |
| IntentDenied | intent 거부 |

WDK 신규 5종 (v0.1.0에서 추가, 실제 표시는 4종 — DeviceRevoked 포함):
| 이벤트 | 설명 |
|--------|------|
| PendingPolicyRequested | AI가 policy 요청 생성 |
| ApprovalVerified | SignedApproval 검증 통과 |
| ApprovalRejected | SignedApproval 검증 실패 |
| PolicyApplied | policy countersign + 저장 + 런타임 반영 |
| DeviceRevoked | 디바이스 revoke |

**필터 (by type)**:
- All / tx / policy / device / error
- 필터 선택 시 해당 타입 이벤트만 표시
- 체인별 필터 (선택적)

**실시간 업데이트 (via WebSocket)**:
- RelayClient.onControl 콜백으로 이벤트 수신
- daemon이 WDK 이벤트 발생 시 → Relay → RN App으로 실시간 전달
- 새 이벤트 수신 → useActivityStore에 추가 → FlatList 자동 갱신

**각 이벤트 항목 표시**:
- 아이콘 (타입별 색상/모양)
- 타임스탬프 (relative: "2m ago", "1h ago")
- 이벤트 요약 (e.g., "Transaction executed on ethereum", "Policy approved")
- 탭하면 상세 정보 (chain, hash, approver, metadata 등)

## 2. 완료 조건
- [ ] `src/domains/activity/screens/ActivityScreen.tsx` 구현 (placeholder 대체)
- [ ] 이벤트 타임라인: FlatList로 시간역순 표시
- [ ] 각 이벤트 항목: 아이콘 + 타임스탬프 (relative) + 요약 텍스트
- [ ] 이벤트 상세: 항목 탭 시 상세 정보 표시 (모달 또는 확장 패널)
- [ ] 타입별 필터: all / tx / policy / device / error 선택 가능
- [ ] 체인별 필터 (선택적)
- [ ] 실시간 업데이트: RelayClient.onControl에서 이벤트 수신 → 자동 추가
- [ ] `src/stores/useActivityStore.ts` 생성 (zustand)
- [ ] events 배열 상태 관리
- [ ] addEvent 액션 (새 이벤트 추가, 시간역순 유지)
- [ ] filter 상태 (typeFilter, chainFilter)
- [ ] setFilter 액션
- [ ] filteredEvents selector (filter 적용된 이벤트 목록)
- [ ] RelayClient에서 이벤트 수신 → addEvent 연동
- [ ] 빈 타임라인 시 placeholder 안내
- [ ] pull-to-refresh 지원

## 3. 롤백 방법
- `src/domains/activity/screens/ActivityScreen.tsx`를 placeholder로 복원
- `src/stores/useActivityStore.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/stores/
    useActivityStore.ts            # zustand 이벤트 상태
```

### 수정 대상 파일
```
packages/app/src/domains/activity/screens/ActivityScreen.tsx  # placeholder → 실제 구현
```

### Side Effect 위험
- ActivityScreen.tsx 수정 — placeholder 대체
- RelayClient (Step 36) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ActivityScreen.tsx | Activity 탭 타임라인 (PRD Layer 5 Activity 탭) | ✅ OK |
| useActivityStore.ts | 이벤트 상태 관리 (design.md stores/useActivityStore.ts) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 이벤트 타임라인 (11종) | ✅ ActivityScreen.tsx | OK |
| 타입별 필터 | ✅ ActivityScreen.tsx + useActivityStore | OK |
| 실시간 WebSocket 업데이트 | ✅ useActivityStore.ts (RelayClient 연동) | OK |
| 이벤트 상세 | ✅ ActivityScreen.tsx | OK |

### 검증 통과: ✅

---

→ 다음: [Step 43: app - Dashboard 탭](step-43-dashboard-tab.md)
