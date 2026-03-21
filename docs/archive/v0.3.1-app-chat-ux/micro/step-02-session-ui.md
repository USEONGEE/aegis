# Step 02: 세션별 대화창

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (파일 revert + 의존성 제거)
- **선행 조건**: Step 01 (Store 재구조화 완료)

---

## 1. 구현 내용 (design.md 기반)

### 네비게이션 구조 변경
- Chat 탭을 Stack Navigator(ChatListScreen + ChatDetailScreen)으로 교체
- @react-navigation/native-stack 의존성 추가
- ChatStackParamList 타입 정의: { ChatList: undefined, ChatDetail: { sessionId: string } }

### ChatListScreen 신규 생성
- sessionList를 lastMessageAt 역순으로 표시
- "새 대화" 버튼 → createSession('user') → ChatDetail 네비게이트
- 세션 카드 탭 → switchSession → ChatDetail 네비게이트
- cron 세션에 "자동 실행" 라벨 표시 (source === 'cron')

### ChatScreen → ChatDetailScreen 리네임
- route.params.sessionId에서 세션 ID 수신
- 기존 마운트 시 세션 생성 로직 제거 (ChatListScreen에서 담당)
- sessions[sessionId] 기반으로 메시지 렌더링
- 헤더에 세션 목록 뒤로가기 affordance

### 앱 재시작 시 복원
- currentSessionId 존재 시 → ChatDetailScreen으로 직접 진입
- currentSessionId 없거나 해당 세션 삭제됨 → ChatListScreen 진입

## 2. 완료 조건
- [ ] RootNavigator에서 Chat 탭이 ChatStack.Navigator 사용
- [ ] ChatListScreen.tsx 파일 존재
- [ ] ChatDetailScreen.tsx 파일 존재 (기존 ChatScreen.tsx 리네임)
- [ ] "새 대화" 버튼으로 새 세션 생성 후 ChatDetailScreen 진입
- [ ] 기존 세션 카드 탭 → 해당 세션 메시지 로드
- [ ] sessionList가 lastMessageAt 역순 정렬
- [ ] cron 세션에 "자동 실행" 라벨 표시
- [ ] ChatDetailScreen 헤더에 뒤로가기 affordance
- [ ] 앱 재시작 시 currentSessionId 존재하면 ChatDetailScreen으로 직접 복원
- [ ] currentSessionId가 trim된 세션이면 ChatListScreen 진입
- [ ] package.json에 @react-navigation/native-stack 존재
- [ ] typing 수신 시 "AI is typing..." 표시 유지 (F18a 회귀)
- [ ] stream delta 수신 시 텍스트 실시간 누적 유지 (F18b 회귀)
- [ ] done 수신 시 상태 초기화 + 최종 응답 표시 유지 (F18c 회귀)
- [ ] error 수신 시 에러 메시지 렌더링 유지 (F18d 회귀)
- [ ] `cd packages/app && npx tsc --noEmit` 통과

## 3. 롤백 방법
- ChatScreen.tsx 복원, ChatListScreen.tsx/ChatDetailScreen.tsx 삭제
- RootNavigator.tsx revert
- `npm uninstall @react-navigation/native-stack`

---

## Scope

### 수정 대상 파일
```
packages/app/
├── src/app/RootNavigator.tsx                          # 수정 — Chat 탭을 Stack Navigator로 교체
├── src/domains/chat/screens/ChatScreen.tsx             # 리네임 → ChatDetailScreen.tsx + route params 수정
└── package.json                                       # 수정 — @react-navigation/native-stack 의존성 추가
```

### 신규 생성 파일
```
packages/app/
├── src/domains/chat/screens/ChatListScreen.tsx         # 신규 — 세션 목록 화면
└── src/domains/chat/screens/ChatDetailScreen.tsx       # 리네임 결과 (ChatScreen.tsx → ChatDetailScreen.tsx)
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| useChatStore.ts | 직접 사용 | sessionList, createSession, switchSession 호출 |
| RootNavigator.tsx | 직접 수정 | Chat 탭 구조 변경 |
| package.json | 수정 | native-stack 의존성 추가 |

### Side Effect 위험
- ChatScreen 임포트하는 다른 파일이 있으면 경로 변경 필요
- 기존 ChatScreen에 연결된 딥링크가 있으면 업데이트 필요 (현재 없음)

### 참고할 기존 패턴
- RootNavigator.tsx의 기존 Tab.Screen 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| RootNavigator.tsx | Stack Navigator 교체 + 복원 로직 | ✅ OK |
| ChatScreen.tsx → ChatDetailScreen.tsx | 리네임 + route params | ✅ OK |
| ChatListScreen.tsx | 세션 목록 신규 | ✅ OK |
| package.json | native-stack 의존성 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Stack Navigator 구조 | ✅ RootNavigator.tsx | OK |
| 세션 목록 화면 | ✅ ChatListScreen.tsx | OK |
| route params 수신 | ✅ ChatDetailScreen.tsx | OK |
| 복원 로직 | ✅ RootNavigator.tsx 또는 ChatNavigator 내 | OK |
| F18a~d 기존 동작 회귀 | ✅ ChatDetailScreen.tsx (기존 핸들러 유지) | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: 수신 흐름 + Cron + 오프라인 복구](step-03-daemon-events.md)
