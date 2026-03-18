# Step 39: app - Chat 탭

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 36 (RelayClient)

---

## 1. 구현 내용 (design.md + PRD 기반)

Chat 탭 — OpenClaw와의 대화 UI. 사용자가 자연어로 DeFi 요청을 보내고, OpenClaw 응답을 표시한다.

- `src/domains/chat/screens/ChatScreen.tsx`: 채팅 화면 (메시지 리스트 + 입력)
- `src/stores/useChatStore.ts`: zustand 채팅 상태 (메시지 목록, 세션 관리)

**메시지 수신 경로**: RelayClient → chat_queue → useChatStore → ChatScreen FlatList

**기능**:
- 메시지 리스트: 사용자 메시지 (오른쪽 bubble) + AI 응답 (왼쪽 bubble)
- 텍스트 입력 + 전송 버튼
- RelayClient.sendChat(sessionId, message) 호출로 chat_queue에 전송
- RelayClient.onChat 콜백으로 chat_queue에서 응답 수신 → 메시지 리스트에 추가
- 세션 관리: 새 대화 시작, 대화 전환
- 로딩 상태: OpenClaw 응답 대기 중 타이핑 인디케이터 ("..." 애니메이션)
- E2E 암호화: RelayClient가 자동 처리 (ChatScreen은 평문만 취급)

**메시지 타입**:
```typescript
ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sessionId: string
}
```

## 2. 완료 조건
- [ ] `src/domains/chat/screens/ChatScreen.tsx` 구현 (placeholder 대체)
- [ ] 메시지 리스트: FlatList로 메시지 표시 (user: 오른쪽 bubble, assistant: 왼쪽 bubble)
- [ ] 텍스트 입력 + 전송 버튼
- [ ] 전송 시 RelayClient.sendChat(sessionId, message) 호출
- [ ] RelayClient.onChat 콜백으로 응답 수신 → 메시지 리스트에 추가
- [ ] `src/stores/useChatStore.ts` 생성 (zustand)
- [ ] messages 배열 상태 관리 (addMessage, clearMessages)
- [ ] currentSessionId 관리
- [ ] isTyping 상태 (AI 응답 대기 중)
- [ ] 빈 대화 시 placeholder 안내 텍스트
- [ ] OpenClaw 응답 대기 중 타이핑 인디케이터 (... 애니메이션)
- [ ] 스크롤: 새 메시지 시 자동 스크롤 to bottom
- [ ] 키보드 avoidance (KeyboardAvoidingView)

## 3. 롤백 방법
- `src/domains/chat/screens/ChatScreen.tsx`를 placeholder로 복원
- `src/stores/useChatStore.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/stores/
    useChatStore.ts                # zustand 채팅 상태
```

### 수정 대상 파일
```
packages/app/src/domains/chat/screens/ChatScreen.tsx  # placeholder → 실제 구현
```

### Side Effect 위험
- ChatScreen.tsx 수정 — placeholder 대체
- RelayClient (Step 36) 의존

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ChatScreen.tsx | Chat 탭 UI (PRD Layer 5 Chat 탭) | ✅ OK |
| useChatStore.ts | 채팅 상태 관리 (design.md stores/) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 메시지 리스트 (user/AI bubbles) | ✅ ChatScreen.tsx | OK |
| 텍스트 입력 + 전송 | ✅ ChatScreen.tsx | OK |
| RelayClient chat_queue 연동 | ✅ ChatScreen.tsx | OK |
| 세션 관리 | ✅ useChatStore.ts | OK |
| 타이핑 인디케이터 | ✅ ChatScreen.tsx | OK |

### 검증 통과: ✅

---

→ 다음: [Step 40: app - Policy 탭](step-40-policy-tab.md)
