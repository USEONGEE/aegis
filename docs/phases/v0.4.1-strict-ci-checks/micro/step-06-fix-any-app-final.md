# Step 06: Explicit Any 수정 — app + 최종 검증

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01~05 완료

---

## 1. 구현 내용 (design.md 기반)
- app/RelayClient.ts — (data as any) 2곳 → 구체 타입
- app/ChatDetailScreen.tsx — Record<string, any> 1곳 + (data as any) 9곳 → 구체 타입
- app/LoginScreen.tsx — catch (err: any) 2곳 → unknown
- app/EnrollmentScreen.tsx — catch (err: any) 1곳 → unknown
- **manifest 패키지**: 현재 explicit any 위반 0건 — 수정 불필요, 최종 검증에서 확인만
- 전체 CI 체크 통합 실행 + tsc 검증

## 2. 완료 조건
- [ ] app 패키지의 `tsc --noEmit -p packages/app/tsconfig.json` 통과
- [ ] app src에서 AnyKeyword 위반 0개 (no-explicit-any 체크)
- [ ] `npx tsx scripts/check/index.ts` → **전체** 체크 PASS (exit code 0)
- [ ] 패키지별 `tsc --noEmit` 전체 통과 (daemon, relay, app, manifest, guarded-wdk)

## 3. 롤백 방법
- git revert

---

## Scope

### 수정 대상 파일 (~15곳)
```
packages/app/src/
├── core/relay/RelayClient.ts                          # 2곳 — (data as any) ×2
├── domains/chat/screens/ChatDetailScreen.tsx           # 10곳 — Record<string, any>, (data as any) ×9
├── domains/auth/screens/LoginScreen.tsx                # 2곳 — catch (err: any) ×2
└── domains/auth/screens/EnrollmentScreen.tsx           # 1곳 — catch (err: any)
```

### Side Effect 위험
- ChatDetailScreen.tsx의 as any 9곳: 데이터 파싱 로직 전반에 영향. 구체 타입 정의 필요
- 최종 통합 실행에서 기존 체크 regression 확인 필수

## FP/FN 검증

### False Positive (과잉)
전 항목이 실제 AnyKeyword 사용으로 확인됨. FP 없음.

### False Negative (누락)
- **manifest 패키지**: explicit any 위반 0건 확인. 수정 불필요, 최종 검증-only.
- app/stores/*.ts — any 사용 없음 확인. 누락 없음.

### 검증 통과: ✅

---

→ 완료: 전체 CI 체크 PASS 확인
