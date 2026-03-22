# Step 04: Explicit Any 수정 — daemon

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- tool-surface.ts — catch (err: any) 15곳 + as any 1곳 → catch (err: unknown) + 타입 가드
- relay-client.ts — catch (err: any) 2곳 + as any 1곳 → unknown + 타입 가드
- index.ts — as any 1곳 + catch (err: any) 2곳 → 구체 타입 / unknown
- admin-server.ts — catch (err: any) 2곳 → unknown
- tool-call-loop.ts — catch (err: any) 1곳 → unknown
- chat-handler.ts — catch (err: any) 1곳 → unknown
- openclaw-client.ts — Record<string, any> 2곳 + as any 1곳 → 구체 타입

## 2. 완료 조건
- [ ] daemon 패키지의 `tsc --noEmit -p packages/daemon/tsconfig.json` 통과
- [ ] daemon src에서 AnyKeyword 위반 0개 (no-explicit-any 체크)
- [ ] 모든 catch (err: any) → catch (err: unknown)으로 변경됨
- [ ] 모든 as any → 구체 타입 또는 as unknown as TargetType으로 변경됨

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일 (~30곳)
```
packages/daemon/src/
├── tool-surface.ts        # ~17곳 — catch (err: any) ×15, as any ×1, : any ×1
├── relay-client.ts        # ~3곳 — catch (err: any) ×2, as any ×1
├── index.ts               # ~3곳 — as any ×1, catch (err: any) ×2
├── admin-server.ts        # ~2곳 — catch (err: any) ×2
├── tool-call-loop.ts      # ~1곳 — catch (err: any)
├── chat-handler.ts        # ~1곳 — catch (err: any)
└── openclaw-client.ts     # ~3곳 — Record<string, any> ×2, as any ×1
```

### Side Effect 위험
- catch (err: unknown) 전환 시 err.message 직접 접근 불가 → instanceof Error 타입 가드 필요
- tool-surface.ts가 가장 변경 많음 — 반복 패턴이므로 일괄 적용 가능

## FP/FN 검증

### False Positive (과잉)
전 항목이 실제 AnyKeyword 사용으로 확인됨. FP 없음.

### False Negative (누락)
daemon/src/cron-scheduler.ts — any 사용 없음 확인. 누락 없음.

### 검증 통과: ✅

---

→ 다음: [Step 05: Explicit Any 수정 — relay](step-05-fix-any-relay.md)
