# 작업위임서 — App UX 버그 수정 (채팅 격리 + 전송 잠금 + seed 부팅)

> 로그아웃/계정변경 시 채팅 미삭제, 전송 잠금이 글로벌, seed 없이 부팅되는 3건의 버그 수정

---

## 6하원칙

### Who (누가)
- 다음 세션 / App + Daemon 코드 접근 가능한 agent
- 필요 패키지: `packages/app`, `packages/daemon`

### What (무엇을)
- [ ] **버그 1 — 로그아웃/계정변경 시 채팅 미삭제**
  - `useAuthStore.clearAuth()` 호출 시 `useChatStore`도 초기화
  - 또는 AsyncStorage key에 userId prefix 추가하여 계정별 격리
- [ ] **버그 2 — Enroll 변경 시 채팅 미삭제**
  - re-enroll = daemon 변경 = 기존 세션 무효화
  - enrollment 완료 콜백에서 채팅 store reset 추가
- [ ] **버그 3 — 메시지 전송 잠금이 글로벌**
  - `useChatStore.isLoading: boolean` → `loadingBySession: Record<string, boolean>`로 변경
  - `setLoading(sessionId, value)` 형태로 세션별 관리
  - `ChatDetailScreen`에서 현재 sessionId 기준으로 disabled 판단
- [ ] **버그 4 — Master seed 없이 daemon 부팅됨**
  - `wdk-host.ts`에서 seed 없으면 `facade: null` 반환 → 부팅 계속됨
  - seed 없으면 startup에서 fail-fast (throw) 할지 사용자 확인 필요

### When (언제)
- 선행 조건: 없음 (즉시 가능)
- 기한: 없음
- 버그 4(seed fail-fast)는 사용자 확인 후 진행

### Where (어디서)

| 버그 | 파일 | 설명 |
|------|------|------|
| #1 채팅 미삭제 | `packages/app/src/stores/useAuthStore.ts` (line 87-92) | `clearAuth()`에서 chat store 미터치 |
| #1 채팅 미삭제 | `packages/app/src/stores/useChatStore.ts` (line 218) | storage key `'wdk-chat-storage'` — userId prefix 없음 |
| #2 Enroll 미삭제 | `packages/app/src/domains/auth/screens/EnrollmentScreen.tsx` | enroll 완료 시 chat reset 없음 |
| #2 Enroll 미삭제 | `packages/app/src/navigation/RootNavigator.tsx` (line 203) | enrollment 상태 `'wdk_enrollment_done'` 플래그만 관리 |
| #3 글로벌 잠금 | `packages/app/src/stores/useChatStore.ts` (line 66-70, 93, 205) | `isLoading` 단일 boolean |
| #3 글로벌 잠금 | `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` (line 447) | `disabled={!inputText.trim() \|\| isLoading}` |
| #4 seed 부팅 | `packages/daemon/src/wdk-host.ts` (line 52-54) | seed 없으면 `{ facade: null }` 반환 |
| #4 seed 부팅 | `packages/daemon/src/index.ts` | facade null이어도 전체 서비스 시작 |

### Why (왜)
- **#1, #2**: 다른 유저가 로그인하면 이전 유저의 채팅이 보임 → **보안 문제**
- **#3**: Session A에서 대기 중이면 Session B에서도 메시지 전송 불가 → **UX 결함**
- **#4**: seed 없이 부팅하면 모든 WDK 작업이 실패하는데 서비스는 떠 있음 → **silent failure**

### How (어떻게)

**버그 1+2 (채팅 격리)** — 두 가지 접근 중 택 1:
- **(A) 로그아웃/enroll 시 reset**: `clearAuth()`와 enroll 콜백에서 `useChatStore.getState().reset()` 호출. 단순하지만 오프라인 채팅 히스토리 날아감.
- **(B) userId prefix 격리**: storage key를 `wdk-chat-storage:${userId}`로 변경. 계정별 독립 저장. 더 견고하지만 구현 복잡도 높음.
- 사용자 미확인 — 받는 agent가 확인 후 진행

**버그 3 (세션별 잠금)**:
```ts
// Before
isLoading: boolean
setLoading: (v: boolean) => void

// After
loadingBySession: Record<string, boolean>
setLoading: (sessionId: string, v: boolean) => void
isSessionLoading: (sessionId: string) => boolean
```

**버그 4 (seed fail-fast)**:
- 사용자에게 확인 필요: "seed 없으면 바로 crash vs 현재 graceful degradation 유지"
- 확인 없이 변경하지 말 것

**워크플로우**: 규모가 작으므로 `/quick-phase-workflow` 또는 직접 구현 권장

---

## 맥락

### 현재 상태
- 프로젝트: v0.5.x 진행중
- 관련 Phase: 없음 (독립 버그 수정)
- App: Expo (React Native), zustand + AsyncStorage
- Daemon: Node.js

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| Chat Store | `packages/app/src/stores/useChatStore.ts` | 채팅 상태 관리 |
| Auth Store | `packages/app/src/stores/useAuthStore.ts` | 인증 상태 관리 |
| ChatDetailScreen | `packages/app/src/domains/chat/screens/ChatDetailScreen.tsx` | 채팅 UI |
| WDK Host | `packages/daemon/src/wdk-host.ts` | seed 초기화 |

---

## 주의사항
- 버그 4(seed)는 **사용자 확인 없이 변경 금지** — 의도적 graceful degradation일 수 있음
- 버그 1+2 접근법(A vs B)도 사용자 확인 필요
- Cron 메시지가 App에서 보이는 것은 **의도된 동작** (이번 범위 아님)
- Relay의 Redis 단방향 전달도 **의도적 설계** (변경 불필요)

## 시작 방법
```bash
# 1. 관련 파일 읽기
cat packages/app/src/stores/useChatStore.ts
cat packages/app/src/stores/useAuthStore.ts

# 2. 사용자에게 확인
# - 버그 1+2: 접근법 A(reset) vs B(userId prefix)?
# - 버그 4: fail-fast vs graceful degradation 유지?

# 3. 구현 시작
```
