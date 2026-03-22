# DoD - v0.4.5

## 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| 1 | `PolicyRejectionError.context`가 `EvaluationContext \| null`로 타입됨 | `grep 'context: unknown' packages/guarded-wdk/src/errors.ts` → 0건 |
| 2 | `approval-store.ts`의 `policies`, `context`, `diff` 필드가 구체 타입 | `grep ': unknown' packages/guarded-wdk/src/approval-store.ts` → 0건 |
| 3 | `PolicyEvaluatedEvent.matchedPermission`과 `context`가 구체 타입 | `grep ': unknown' packages/protocol/src/events.ts` → 0건 |
| 4 | `ChatDoneEvent.toolResults`가 구체 타입 | `grep 'unknown\[\]' packages/protocol/src/chat.ts` → 0건 |
| 5 | `daemon/tool-surface.ts`의 결과 타입에서 `unknown[]` 제거 | `grep 'unknown\[\]' packages/daemon/src/tool-surface.ts` → 0건 |
| 6 | dead-exports B 카테고리 중 크로스 패키지 건수 감소 | `npx tsx scripts/check/index.ts --check=cross/dead-exports` 건수 < 126 |
| 7 | 기존 `as unknown as` 캐스트 중 불필요해진 것 제거 | grep으로 daemon/app에서 `as unknown as` 감소 확인 |

## 기본 검증
- [ ] `npx tsc --noEmit` 통과 (전체 패키지)
- [ ] `npx tsx scripts/check/index.ts` 기존 PASS 체크 퇴행 없음
- [ ] 빌드 성공
