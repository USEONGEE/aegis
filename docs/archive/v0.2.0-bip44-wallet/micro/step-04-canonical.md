# Step 04: canonical intentHash에 timestamp 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음 (Step 01과 병렬 가능)

---

## 1. 구현 내용 (design.md 기반)
- `IntentInput` 인터페이스에 `timestamp: number` 추가
- `intentHash()` 함수에 timestamp를 normalized 객체에 포함
- 호출부(guarded-middleware.ts, daemon tool-surface.ts)에서 timestamp 전달

## 2. 완료 조건
- [ ] `IntentInput`에 `timestamp` 필드 존재
- [ ] `intentHash({ chainId, to, data, value, timestamp })` 시그니처
- [ ] unit test: 동일 `(chainId, to, data, value)` + 다른 timestamp → 다른 해시
- [ ] unit test: 동일 `(chainId, to, data, value, timestamp)` → 동일 해시 (결정론적)
- [ ] `cd packages/canonical && npx tsc --noEmit` 에러 0

## 3. 롤백 방법
- `git revert`

---

## Scope

### 수정 대상 파일
```
packages/canonical/src/
└── index.ts                 # IntentInput + intentHash 수정
packages/canonical/tests/    # (있으면) intentHash 테스트 수정
```

### Side Effect 위험
- guarded-middleware.ts와 daemon tool-surface.ts에서 intentHash 호출 시 timestamp 인자 추가 필요 — Step 05, 06에서 처리

## FP/FN 검증
- Scope 2파일 모두 구현 내용에 직접 근거 있음 → FP 없음
- 구현 내용의 모든 항목이 Scope에 반영됨 → FN 없음
- **검증 통과: ✅**

---

→ 다음: [Step 05: guarded-middleware 연동](step-05-middleware.md)
