# Step 05: app import 변경 + cancel 분기

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (protocol 패키지), Step 03 (daemon cancel 분리 + message_started)

---

## 1. 구현 내용 (design.md 기반)

- `packages/app/src/core/approval/types.ts`:
  - `@wdk-app/protocol`에서 `SignedApprovalFields` import (또는 protocol 타입 참조)
  - 기존 `SignedApprovalPayload`와 protocol의 `SignedApprovalFields` 간 관계 정리
- `packages/app/src/core/relay/RelayClient.ts`:
  - 기존 `cancelMessage(messageId)` 메서드 → 2개로 분리:
    - `cancelQueued(messageId)`: `type: 'cancel_queued'` 전송
    - `cancelActive(messageId)`: `type: 'cancel_active'` 전송
  - 또는 기존 메서드를 유지하되 내부에서 cancel 종류를 인자로 받도록 변경
- `packages/app/src/stores/useChatStore.ts`:
  - `queuedMessageId: string | null` → `messageState` 상태 추가: `'idle' | 'queued' | 'active'`
  - `setQueuedMessageId` 대신 `setMessageState` 액션 (또는 병행)
  - `message_started` 수신 시 상태를 `'active'`로 전환하는 로직 연동
- `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx`:
  - `message_started` control 이벤트 핸들러 추가: messageState를 `'active'`로 전환
  - cancel 버튼의 `cancelPendingMessage` 로직 변경:
    - messageState === 'queued' → `relay.cancelQueued(messageId)` (또는 `relay.sendControl({ type: 'cancel_queued', ... })`)
    - messageState === 'active' → `relay.cancelActive(messageId)` (또는 `relay.sendControl({ type: 'cancel_active', ... })`)
  - 기존 `cancel_message_result` 핸들러 → `cancel_queued` / `cancel_active` 응답 처리
- `packages/app/src/app/RootNavigator.tsx`:
  - `cron_session_created` 이벤트 처리에서 `ControlEvent` 또는 `CronSessionCreatedEvent` 타입 사용
  - `@wdk-app/protocol` import 추가
- `packages/app/package.json`:
  - `@wdk-app/protocol` 의존성 추가 (`"workspace:*"`)

## 2. 완료 조건
- [ ] `packages/app/src/core/approval/types.ts`에서 `@wdk-app/protocol` import 존재 (F10)
- [ ] `packages/app/src/stores/useChatStore.ts`에서 `messageState` 존재 (F23)
- [ ] `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx`에서 `message_started` 핸들러 존재 (F24)
- [ ] `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx`에서 messageState 기반 cancel_queued/cancel_active 분기 존재 (F25)
- [ ] `packages/app/src/app/RootNavigator.tsx`에서 `ControlEvent` 또는 `CronSessionCreatedEvent` 타입 사용 (F26)
- [ ] `packages/app/src/core/relay/RelayClient.ts`에서 `cancel_message` 단일 전송 제거, cancel_queued/cancel_active 분기 전송

## 3. 롤백 방법
- 롤백 절차: git에서 app 관련 파일 복원
- 영향 범위: app의 cancel UX 변경. 롤백 시 기존 단일 cancel_message 동작으로 복귀.

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/
│   ├── core/
│   │   ├── approval/types.ts       # 수정 - @wdk-app/protocol import 추가
│   │   └── relay/RelayClient.ts    # 수정 - cancelMessage → cancel_queued/cancel_active 분기
│   ├── stores/useChatStore.ts      # 수정 - messageState 상태 추가
│   ├── domains/chat/screens/
│   │   └── ChatDetailScreen.tsx    # 수정 - message_started 핸들러 + cancel 분기
│   └── app/RootNavigator.tsx       # 수정 - ControlEvent 타입 사용
└── package.json                    # 수정 - @wdk-app/protocol 의존성 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| types.ts | 직접 수정 | protocol import 추가 |
| RelayClient.ts | 직접 수정 | cancel 메서드 분리 |
| useChatStore.ts | 직접 수정 | messageState 상태 추가 |
| ChatDetailScreen.tsx | 직접 수정 | message_started 핸들러 + cancel 분기 |
| RootNavigator.tsx | 직접 수정 | ControlEvent 타입 적용 |
| app/package.json | 직접 수정 | 의존성 추가 |

### Side Effect 위험
- 위험 1: Metro bundler가 workspace 패키지를 resolve하지 못할 수 있음
  - 대응: `metro.config.js`에 `packages/protocol` 경로 추가가 필요할 수 있음. 빌드 테스트로 확인.
- 위험 2: `queuedMessageId` → `messageState` 변환 시 기존 `queuedMessageId` 의존 로직 깨짐
  - 대응: `queuedMessageId`는 유지하되 `messageState`를 별도 추가. cancel 분기에만 messageState 사용.

### 참고할 기존 패턴
- `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx:287-298`: 기존 `cancelPendingMessage` 로직
- `packages/app/src/core/relay/RelayClient.ts:447-452`: 기존 `cancelMessage` 메서드
- `packages/app/src/stores/useChatStore.ts:69`: 기존 `queuedMessageId` 상태

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| types.ts | F10: protocol import | ✅ OK |
| RelayClient.ts | cancel 메서드 분리 | ✅ OK |
| useChatStore.ts | F23: messageState | ✅ OK |
| ChatDetailScreen.tsx | F24, F25: message_started + cancel 분기 | ✅ OK |
| RootNavigator.tsx | F26: ControlEvent 타입 | ✅ OK |
| app/package.json | 의존성 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| types.ts protocol import | ✅ | OK |
| RelayClient cancel 분리 | ✅ | OK |
| useChatStore messageState | ✅ | OK |
| ChatDetailScreen message_started | ✅ | OK |
| ChatDetailScreen cancel 분기 | ✅ | OK |
| RootNavigator ControlEvent | ✅ | OK |
| metro.config.js | ❌ 조건부 필요 | 참고: Metro resolve 실패 시 추가 필요. 빌드 테스트로 판단. |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 06: 테스트 업데이트](step-06-tests.md)
