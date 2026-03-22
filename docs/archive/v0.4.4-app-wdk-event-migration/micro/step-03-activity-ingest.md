# Step 03: Activity Store 이벤트 적재

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 02

## 1. 구현 내용
- RootNavigator syncHandler에서 event_stream 메시지 감지 → useActivityStore.addEvent()
- useActivityStore의 ActivityEventType에 'ApprovalFailed' 추가
- AnyWDKEvent → ActivityEvent 매핑 규칙:
  - `id`: `event.requestId` 또는 `${event.type}:${event.timestamp}` (requestId 없는 이벤트용)
  - `type`: `event.type` (ActivityEventType으로 cast)
  - `timestamp`: `event.timestamp`
  - `chainId`: `event.chainId` (있으면) 또는 null
  - `summary`: `event.type` 그대로 (화면 표시는 후속 Phase에서 포매팅)
  - `details`: event 전체를 JSON 저장 (향후 화면에서 필요한 필드 추출 가능)
- store 적재만 (화면 표시는 후속)

## 2. 완료 조건
- [ ] syncHandler에서 event_stream → addEvent() 호출
- [ ] ActivityEventType에 'ApprovalFailed' 포함
- [ ] AnyWDKEvent → ActivityEvent 매핑이 위 규칙대로 구현
- [ ] tsc 통과

## 3. 롤백 방법
- git revert (RootNavigator.tsx + useActivityStore.ts)

## Scope

### 수정 대상 파일
```
packages/app/src/app/
└── RootNavigator.tsx            # 수정 — syncHandler에 event_stream 처리 추가

packages/app/src/stores/
└── useActivityStore.ts          # 수정 — ActivityEventType에 ApprovalFailed 추가
```

## FP/FN 검증
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음: ActivityScreen은 변경 불필요 (store 적재만)
