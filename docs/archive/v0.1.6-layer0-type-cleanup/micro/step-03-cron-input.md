# Step 03: CronInput optional 정리

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음 (Step 01, 02와 독립)

---

## 1. 구현 내용 (design.md Step C)
- `CronInput`: `id`, `createdAt` 제거 (store 책임), `sessionId`, `chainId` required화
- 최종: `{ sessionId: string, interval: string, prompt: string, chainId: number | null }`
- store 구현체: `cron.id || randomUUID()` → `randomUUID()`, `cron.sessionId || ''` → `cron.sessionId` 등 fallback 제거
- 테스트: `chainId: null` round-trip 테스트 추가 (DoD E2)

## 2. 완료 조건
- [ ] `CronInput` 필드: 정확히 4개 (`sessionId`, `interval`, `prompt`, `chainId`), `?` 없음 (DoD F4)
- [ ] store 테스트에서 `chainId: null` saveCron → listCrons round-trip 통과 (DoD E2)
- [ ] `pnpm --filter guarded-wdk test` — 6 suites pass (DoD N1)

## 3. 롤백 방법
- `git revert <commit>`

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-store.ts        # CronInput 재정의
├── json-approval-store.ts   # saveCron fallback 제거
└── sqlite-approval-store.ts # 동일

tests/
├── json-approval-store.test.ts  # id 제거, sessionId 필수, chainId null 테스트 추가
└── sqlite-approval-store.test.ts # 동일
```

### Side Effect 위험
- daemon/tool-surface.ts의 `saveCron` 호출은 이미 모든 필드 제공 → 변경 불필요

## FP/FN 검증

### False Positive (과잉)
| Scope 파일 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-store.ts | CronInput 재정의 | ✅ OK |
| json-approval-store.ts | saveCron fallback 제거 | ✅ OK |
| sqlite-approval-store.ts | 동일 | ✅ OK |
| json-approval-store.test.ts | id 제거, sessionId 필수, chainId null 테스트 | ✅ OK |
| sqlite-approval-store.test.ts | 동일 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| id/createdAt 제거 | ✅ | OK |
| sessionId/chainId required | ✅ | OK |
| chainId null round-trip 테스트 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: loadPendingByRequestId 반환 타입 변경](step-04-pending-return.md)
