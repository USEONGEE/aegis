# Step 05: Explicit Any 수정 — relay

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- routes/auth.ts — any[] 타입 3곳 + (k: any) 콜백 + catch (err: any) + as any → 구체 타입
- routes/ws.ts — payload: any + as any 6곳 + catch (err: any) 5곳 → 구체 타입 / unknown
- routes/push.ts — as any 1곳 + catch (err: any) 1곳 → unknown
- queue/redis-queue.ts — as any 2곳 + catch (err: any) 2곳 → unknown

## 2. 완료 조건
- [ ] relay 패키지의 `tsc --noEmit -p packages/relay/tsconfig.json` 통과
- [ ] relay src에서 AnyKeyword 위반 0개 (no-explicit-any 체크)
- [ ] auth.ts의 `any[]` 타입이 구체 타입으로 변경됨
- [ ] ws.ts의 `payload: any`가 구체 타입으로 변경됨

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일 (~30곳)
```
packages/relay/src/
├── routes/auth.ts         # ~12곳 — any[] ×3, (k: any) ×1, catch (err: any) ×4, as any ×4
├── routes/ws.ts           # ~12곳 — payload: any ×1, as any ×6, catch (err: any) ×5
├── routes/push.ts         # ~2곳 — as any ×1, catch (err: any) ×1
└── queue/redis-queue.ts   # ~4곳 — as any ×2, catch (err: any) ×2
```

### Side Effect 위험
- auth.ts의 JWKS 키 타입(any[]) 변경: 외부 jose 라이브러리 타입과 호환 필요
- ws.ts의 payload 타입 변경: WebSocket 메시지 핸들러 전체에 영향

## FP/FN 검증

### False Positive (과잉)
전 항목이 실제 AnyKeyword 사용으로 확인됨. FP 없음.

### False Negative (누락)
relay/src/middleware/rate-limit.ts — any 사용 없음 확인. 누락 없음.

### 검증 통과: ✅

---

→ 다음: [Step 06: Explicit Any 수정 — app + 최종 검증](step-06-fix-any-app-final.md)
