# Step 02: Daemon 잔여 dead code + incidental 정리

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

---

## 1. 구현 내용
- `ToolResult` deprecated alias 제거 (`tool-surface.ts:181-182`)
- `listPending()` 메서드 + `PendingMessageRequest` 타입 제거 (`message-queue.ts:15, 77-87`)
- `getQueue()` public → private 변경 (`message-queue.ts:137`)
- 중복 JSDoc 제거 (`relay-client.ts:159-162`)
- listPending 테스트 제거 (`message-queue.test.ts`)

## 2. 완료 조건
- [ ] `grep "^export type ToolResult" packages/daemon/src/tool-surface.ts` → 결과 없음 (F7)
- [ ] `grep -E "listPending|PendingMessageRequest" packages/daemon/src/message-queue.ts` → 결과 없음 (F8)
- [ ] `grep "^\s*private getQueue\s*(" packages/daemon/src/message-queue.ts` → 1건 매치 (F9)
- [ ] `sed -n '/^  onMessage .*(handler/,/^  send (type/p' packages/daemon/src/relay-client.ts | grep -c '/\*\*'` → 1 (F10)
- [ ] `cd packages/daemon && npx tsc --noEmit` 통과 (N1)
- [ ] `cd packages/daemon && npx jest` 통과 (N3, E3)

## 3. 롤백 방법
- `git checkout -- packages/daemon/src/tool-surface.ts packages/daemon/src/message-queue.ts packages/daemon/src/relay-client.ts packages/daemon/tests/message-queue.test.ts`

---

## Scope

### 수정 대상 파일
```
packages/daemon/
├── src/
│   ├── tool-surface.ts    # 수정 - ToolResult alias 삭제
│   ├── message-queue.ts   # 수정 - listPending + getQueue private
│   └── relay-client.ts    # 수정 - 중복 JSDoc 제거
└── tests/
    └── message-queue.test.ts  # 수정 - listPending 테스트 삭제
```

## FP/FN 검증
### 검증 통과: ✅

---

→ 다음: [Step 03: App pairing 코드 제거](step-03-app-pairing-removal.md)
