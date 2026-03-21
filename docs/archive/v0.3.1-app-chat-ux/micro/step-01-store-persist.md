# Step 01: Store 재구조화 + 영속화

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (store 파일 revert + 의존성 제거)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

### App Store 전면 재설계
- useChatStore의 messages[] → `sessions: Record<string, ChatMessage[]>` 전환
- ChatMessage를 discriminated union(TextChatMessage | ToolChatMessage | StatusChatMessage)으로 재정의
- ChatSession 타입 신규 정의 (id, title, lastMessageAt, source, messageCount)
- sessionList: ChatSession[] 추가
- zustand persist 미들웨어 + AsyncStorage 적용
- partialize: sessions, sessionList, currentSessionId, streamCursors, controlCursor 영속화
- isLoading, isTyping, queuedMessageId는 비영속
- addMessage에서 미존재 세션 자동 upsert
- createSession(source: 'user' | 'cron') — source 필수
- MAX_SESSIONS=50, MAX_MESSAGES_PER_SESSION=500 제한
- streamCursors: Record<string, string> + controlCursor: string 추가

### 의존성 추가
- @react-native-async-storage/async-storage

### ChatScreen.tsx 호환 업데이트
- 기존 ChatScreen.tsx가 새 store API(sessions[currentSessionId], addMessage 등)로 동작하도록 수정
- messages[] 직접 참조 → sessions[currentSessionId] || [] 로 전환
- 이를 통해 Step 01 완료 시 tsc 통과 보장 (Step 02의 리네임과 독립)

## 2. 완료 조건
- [ ] useChatStore.ts에 `sessions: Record<string, ChatMessage[]>` 타입 선언 존재
- [ ] `type ChatMessage = TextChatMessage | ToolChatMessage | StatusChatMessage` 선언 + 각 variant에 kind discriminant
- [ ] ChatSession 타입에 id, title, lastMessageAt, source, messageCount 필드 (모두 필수)
- [ ] zustand persist + createJSONStorage(() => AsyncStorage) 적용
- [ ] partialize에서 isLoading/isTyping/queuedMessageId 제외
- [ ] currentSessionId 영속화 포함
- [ ] addMessage가 미존재 sessionId에 대해 세션 자동 생성
- [ ] createSession의 source 인자가 필수 (optional 아님)
- [ ] MAX_SESSIONS 초과 시 가장 오래된 세션 제거 로직 존재
- [ ] MAX_MESSAGES_PER_SESSION 초과 시 오래된 메시지 trim 로직 존재
- [ ] streamCursors, controlCursor 필드 + updateCursor/updateControlCursor 액션 존재
- [ ] `cd packages/app && npx tsc --noEmit` 통과
- [ ] package.json에 @react-native-async-storage/async-storage 존재

## 3. 롤백 방법
- `git checkout -- packages/app/src/stores/useChatStore.ts packages/app/src/domains/chat/screens/ChatScreen.tsx`
- `cd packages/app && npm uninstall @react-native-async-storage/async-storage`

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/stores/useChatStore.ts            # 전면 재작성 — Record 구조 + persist + discriminated union
├── src/domains/chat/screens/ChatScreen.tsx # 호환 업데이트 — 새 store API 적용
└── package.json                          # 의존성 추가
```

### 신규 생성 파일
없음 (useChatStore.ts 내에서 타입 정의)

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| ChatScreen.tsx | 직접 수정 | 새 store API(sessions[sid])에 맞게 참조 업데이트 |

### Side Effect 위험
- ChatScreen.tsx를 이 Step에서 호환 업데이트하므로 컴파일 에러 없음

### 참고할 기존 패턴
- `packages/app/src/stores/useActivityStore.ts`: MAX_EVENTS=500 제한 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| useChatStore.ts | Store 전면 재설계 | ✅ OK |
| ChatScreen.tsx | 새 store API 호환 업데이트 | ✅ OK |
| package.json | AsyncStorage 의존성 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Record 구조 전환 | ✅ useChatStore.ts | OK |
| discriminated union | ✅ useChatStore.ts | OK |
| zustand persist | ✅ useChatStore.ts + package.json | OK |
| streamCursors/controlCursor | ✅ useChatStore.ts | OK |
| ChatScreen 호환 업데이트 | ✅ ChatScreen.tsx | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: 세션별 대화창](step-02-session-ui.md)
