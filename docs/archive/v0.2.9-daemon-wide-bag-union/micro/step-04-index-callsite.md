# Step 04: index.ts 호출부 수정

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 03 (ControlMessage union이 control-handler.ts에 정의되어야 import 가능)

---

## 1. 구현 내용 (design.md 기반)

design.md 7.1절 + 8절 Step 4 기반:

- `index.ts:87`에서 `handleControlMessage(payload, ...)` 호출의 `payload` 인자를 `ControlMessage` 타입으로 명시
  - 현재: `relayClient.onMessage((type, payload, raw) => { ... handleControlMessage(payload, ...) })` -- `payload`는 `any`
  - 변경: `payload as ControlMessage` 캐스트 적용
- wire JSON -> `ControlMessage` 변환을 위한 TODO 주석 추가:
  - `// TODO: v0.2.9+ — wire JSON parse/validate 후 ControlMessage로 변환. 현재는 as cast.`
- `ControlMessage` import 추가 (현재 `PairingSession`만 import 중)

## 2. 완료 조건

- [ ] `rg 'as ControlMessage' packages/daemon/src/index.ts` 결과 1건 (F14)
- [ ] `rg 'TODO' packages/daemon/src/index.ts` 결과 1건 이상 -- wire parse TODO 주석 (F14)
- [ ] `rg 'import.*ControlMessage.*control-handler' packages/daemon/src/index.ts` 결과 1건 -- ControlMessage import 존재
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` 이전 baseline 대비 새 에러 미발생 (N1)

## 3. 롤백 방법
- 롤백 절차: `git revert` 단일 커밋. `as ControlMessage` 캐스트 제거, TODO 주석 제거.
- 영향 범위: `index.ts`만 영향. 기능적으로 런타임 동작 변경 없음 (TypeScript 캐스트 + 주석만).

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── index.ts  # 수정 - handleControlMessage 호출부 payload 타입 캐스트, TODO 주석, ControlMessage import 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| index.ts | 직접 수정 | 호출부 타입 캐스트 + import 추가 + TODO 주석 |
| control-handler.ts | 의존 (읽기) | Step 03에서 재정의한 ControlMessage 타입을 import |

### Side Effect 위험
- 위험 없음. `as ControlMessage`는 TypeScript 컴파일 시점 캐스트이며 런타임 코드에 영향 없음. TODO 주석은 코드 동작에 무관.

### 참고할 기존 패턴
- `index.ts:8-9`: 현재 control-handler import (`handleControlMessage`, `PairingSession`)
- `index.ts:84-92`: 현재 `relayClient.onMessage` 콜백 내 control 분기

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| index.ts | as ControlMessage 캐스트, TODO 주석, import 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| payload as ControlMessage 캐스트 | ✅ index.ts | OK |
| TODO 주석 (wire parse) | ✅ index.ts | OK |
| ControlMessage import 추가 | ✅ index.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 05: 테스트 업데이트](step-05-test-update.md)
