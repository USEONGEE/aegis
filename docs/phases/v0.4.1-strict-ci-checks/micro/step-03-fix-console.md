# Step 03: Console 위반 수정

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- daemon/index.ts — console.log 10곳 (enrollment UI) + console.error 1곳 (fatal) → logger 대체
- app/RelayClient.ts — console.warn 2곳 + console.error 4곳 + console.log 1곳 + console.warn 1곳 → 제거

## 2. 완료 조건
- [ ] `npx tsx scripts/check/index.ts --check=cross/no-console` → 0 violations
- [ ] daemon/index.ts에 console.* 호출 0개
- [ ] app/RelayClient.ts에 console.* 호출 0개

## 3. 롤백 방법
- git revert (각 파일의 console 호출 복원)

---

## Scope

### 수정 대상 파일 (19곳)
```
packages/daemon/src/
└── index.ts               # 11곳 — :156-165 (console.log ×10), :265 (console.error)

packages/app/src/
└── core/relay/RelayClient.ts  # 8곳 — :188, :218, :235, :253, :257, :272, :303, :316
```

### Side Effect 위험
- daemon enrollment UI 출력 제거 시, 초기 등록 코드가 stdout에 출력되지 않을 수 있음 → logger.info로 대체하여 출력 유지

## FP/FN 검증

### False Positive (과잉)
전 항목이 실제 console.* 호출로 확인됨. FP 없음.

### False Negative (누락)
relay, manifest, guarded-wdk, canonical, protocol — console.* 사용 0건 확인. 수정 불필요.

### 검증 통과: ✅

---

→ 다음: [Step 04: Explicit Any 수정 — daemon](step-04-fix-any-daemon.md)
