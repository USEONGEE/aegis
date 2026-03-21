# Step 02: Queue 타입 유도형 전환 (문제 3)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (한 줄 변경이므로 git revert로 복원)
- **선행 조건**: 없음 (Step 01과 독립)

---

## 1. 구현 내용 (design.md 기반)

- `src/message-queue.ts`에서 `PendingMessageRequest` interface를 `Omit<QueuedMessage, 'userId' | 'abortController'>` type alias로 교체

## 2. 완료 조건

- [ ] `packages/daemon/src/message-queue.ts`에 `type PendingMessageRequest = Omit<QueuedMessage, 'userId' | 'abortController'>` 존재
- [ ] `packages/daemon/src/message-queue.ts`에 `interface PendingMessageRequest` 없음 (0건)
- [ ] `listPending()` 메서드의 반환 타입이 여전히 `PendingMessageRequest[]`
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0 (DoD N1)
- [ ] DoD: F3 충족

## 3. 롤백 방법
- 롤백 절차: `git revert <commit>` -- type alias를 원래 interface로 복원
- 영향 범위: `message-queue.ts` 1개 파일

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── message-queue.ts    # 수정 - PendingMessageRequest interface -> Omit type alias
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| message-queue.ts | 직접 수정 | PendingMessageRequest 정의 변경 |
| admin-server.ts | 간접 영향 없음 | PendingMessageRequest를 import하지 않음 (확인 완료) |

### Side Effect 위험
- 위험 없음: `PendingMessageRequest`의 구조가 동일하므로 TypeScript 구조적 타이핑에 의해 모든 소비자 코드가 자동 호환. `listPending()` 메서드의 map 본문도 변경 불필요.

### 참고할 기존 패턴
- 없음 (단순 Omit 유도)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| message-queue.ts | PendingMessageRequest Omit 유도 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| PendingMessageRequest를 Omit으로 교체 | ✅ | OK |
| PendingMessageRequest 소비자 코드 변경? | 소비자 없음 -- listPending() 내부에서만 사용, 외부 import 없음 (rg 확인) | OK -- 누락 없음 |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 03: Cron 타입 통합](step-03-cron-type-unify.md)
