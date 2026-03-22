# Step 01: Store 인터페이스 전환

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

- TD-1: `SessionTransientState` 인터페이스 + `DEFAULT_SESSION_TRANSIENT` 상수 정의
- TD-2: `ChatState`에서 4개 글로벌 필드/setter 제거, `sessionTransient` + `getSessionTransient` + `setSessionTransient` + `resetSessionTransient` 추가
- TD-3: `getSessionTransient` fallback 구현 (`?? DEFAULT_SESSION_TRANSIENT`)
- TD-4: `partialize`에서 `sessionTransient` 제외 확인 (기존 명시적 포함 목록 방식이므로 변경 불필요)
- TD-6: `addMessage` 세션 트림 시 `sessionTransient` 엔트리 삭제

## 2. 완료 조건

- [ ] `ChatState` 인터페이스에 `isLoading`, `isTyping`, `queuedMessageId`, `messageState` 4개 top-level 필드가 없음
- [ ] `ChatState` 인터페이스에 `setLoading`, `setTyping`, `setQueuedMessageId`, `setMessageState` 4개 setter가 없음
- [ ] `SessionTransientState` 인터페이스가 정의됨 (4개 필드)
- [ ] `DEFAULT_SESSION_TRANSIENT` 상수가 정의됨
- [ ] `sessionTransient: Record<string, SessionTransientState>`가 `ChatState`에 존재
- [ ] `getSessionTransient(sessionId)` 구현 — 미등록 세션은 `DEFAULT_SESSION_TRANSIENT` 반환
- [ ] `setSessionTransient(sessionId, patch)` 구현 — 해당 세션만 업데이트
- [ ] `resetSessionTransient(sessionId)` 구현 — 해당 세션을 기본값으로 초기화
- [ ] `partialize`에 `sessionTransient` 미포함 (transient 상태 persist 안 됨)
- [ ] `addMessage` 세션 트림 시 `sessionTransient` 엔트리도 삭제

## 3. 롤백 방법
- `git revert <commit>` — 단일 파일 변경이므로 충돌 없음

---

## Scope

### 수정 대상 파일
```
packages/app/src/stores/
└── useChatStore.ts  # 수정 - store 인터페이스 전환
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| useChatStore.ts | 직접 수정 | 인터페이스 + 구현 변경 |
| ChatDetailScreen.tsx | 간접 영향 | Step 02에서 소비자 전환 |

### Side Effect 위험
- 위험: store 인터페이스 변경으로 ChatDetailScreen에서 tsc 에러 발생
- 대응: Step 02에서 즉시 해결 (Step 01과 02는 연속 작업)

### 참고할 기존 패턴
- `useChatStore.ts:63` — `streamCursors: Record<string, string>` 패턴
- `useChatStore.ts:210-213` — `updateCursor` setter 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| useChatStore.ts | TD-1~TD-4, TD-6 모두 이 파일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| TD-1: SessionTransientState | ✅ useChatStore.ts | OK |
| TD-2: Store 인터페이스 | ✅ useChatStore.ts | OK |
| TD-3: Getter fallback | ✅ useChatStore.ts | OK |
| TD-4: Persist 제외 | ✅ useChatStore.ts | OK |
| TD-6: 세션 트림 cleanup | ✅ useChatStore.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: ChatDetailScreen 소비자 전환](step-02-consumer-migration.md)
