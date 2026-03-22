# Step 02: ChatDetailScreen 소비자 전환

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)

- TD-5: store에서 4개 개별 상태 대신 `getSessionTransient(currentSessionId)` 사용
- TD-5: 모든 setter 호출을 `setSessionTransient(currentSessionId, { ... })` / `resetSessionTransient(currentSessionId)`로 교체
- TD-7: `CancelCompleted`/`CancelFailed` 핸들러를 완전 no-op (`return`만)으로 변경
- F8: 동일 세션 내 단일 in-flight 유지 확인 (기존 `onPress={isLoading ? cancel : send}` 패턴 유지)

## 2. 완료 조건

- [ ] store destructuring에서 4개 개별 상태/setter 제거, `getSessionTransient` + `setSessionTransient` + `resetSessionTransient` 사용
- [ ] 모든 `setLoading(...)` → `setSessionTransient(sessionId, { isLoading: ... })` 전환
- [ ] 모든 `setTyping(...)` → `setSessionTransient(sessionId, { isTyping: ... })` 전환
- [ ] 모든 `setQueuedMessageId(...)` → `setSessionTransient(sessionId, { queuedMessageId: ... })` 전환
- [ ] 모든 `setMessageState(...)` → `setSessionTransient(sessionId, { messageState: ... })` 전환
- [ ] 이벤트 핸들러에서 세션 리셋 시 `resetSessionTransient(sessionId)` 사용
- [ ] `CancelCompleted`/`CancelFailed` 핸들러가 `return`만 수행 (상태/버퍼 건드리지 않음)
- [ ] UI에서 `isLoading`, `isTyping` 등이 현재 세션 기준으로만 읽힘
- [ ] 전송 버튼 `onPress={isLoading ? cancelPendingMessage : sendMessage}` 패턴 유지 (단일 in-flight)

### 통합 검증 (Step 01+02 완료 후 수행)
- [ ] 변경 전/후 `npx tsc --noEmit -p packages/app/tsconfig.json 2>&1 | grep -c "error TS"` diff: 증가 0
- [ ] 수동: 세션 A 로딩 중 세션 B에서 전송 가능
- [ ] 수동: 세션 A 로딩 중 세션 B 전송 후 세션 A 복귀 시 로딩 상태 유지
- [ ] 수동: 세션 A 취소 후 세션 B 스트림 지속
- [ ] 수동: 앱 재시작 후 idle 복원

## 3. 롤백 방법
- `git revert <commit>` — Step 01 롤백 시 함께 롤백 필요

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/chat/screens/
└── ChatDetailScreen.tsx  # 수정 - 모든 transient 상태 읽기/쓰기 세션 키 전환
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| ChatDetailScreen.tsx | 직접 수정 | 모든 setter/getter 호출 전환 |
| useChatStore.ts | 선행 의존 | Step 01에서 인터페이스 변경 완료 |

### Side Effect 위험
- 위험: 이벤트 핸들러에서 sessionId 누락 시 잘못된 세션 상태 업데이트
- 대응: `eventData.sessionId ?? currentSessionId` 패턴으로 항상 세션 키 보장
- 위험: `cancelPendingMessage`에서 `currentSessionId`가 취소 요청 시점의 세션과 다를 수 있음
- 대응: `cancelPendingMessage`는 현재 화면의 세션만 취소 (기존 동작 유지)

### 참고할 기존 패턴
- `ChatDetailScreen.tsx:123` — `const isCurrentSession = msgSessionId === currentSessionId` 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ChatDetailScreen.tsx | TD-5, TD-7, F8 모두 이 파일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| TD-5: 소비 패턴 전환 | ✅ ChatDetailScreen.tsx | OK |
| TD-7: Cancel no-op | ✅ ChatDetailScreen.tsx | OK |
| F8: 단일 in-flight | ✅ ChatDetailScreen.tsx | OK |
| RootNavigator.tsx | 해당 없음 — transient 상태 미사용 확인 완료 | OK |
| ChatListScreen.tsx | 해당 없음 — transient 상태 미사용 확인 완료 | OK |

### 검증 통과: ✅
