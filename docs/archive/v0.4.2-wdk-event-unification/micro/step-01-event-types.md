# Step 01: WDK 이벤트 타입 시스템

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `protocol/src/events.ts` 신규 파일 생성
- `WDKEventBase { type: string; timestamp: number }` 정의
- 14종 개별 이벤트 타입 정의 (기존 13종 + ApprovalFailed)
- `AnyWDKEvent` discriminated union 정의
- `protocol/src/index.ts`에서 이벤트 타입 re-export
- 참고: `ApprovalSubmitContext`는 guarded-wdk 내부 API 계약이므로 Step 04에서 guarded-wdk에 정의

## 2. 완료 조건
- [ ] `protocol/src/events.ts` 파일 존재
- [ ] 14종 이벤트 타입이 각각 `extends WDKEventBase`
- [ ] `AnyWDKEvent` union이 14종 전체를 포함
- [ ] `protocol/src/index.ts`에서 모든 이벤트 타입 export (ApprovalSubmitContext는 별도 — Step 04)
- [ ] `tsc --noEmit` 통과 (protocol)

## 3. 롤백 방법
- git revert (신규 파일 추가만, 기존 코드 미변경)

---

## Scope

### 신규 생성 파일
```
packages/protocol/src/
└── events.ts          # 신규 — WDK 이벤트 타입 시스템
```

### 수정 대상 파일
```
packages/protocol/src/
└── index.ts           # 수정 — events.ts re-export 추가
```

## FP/FN 검증

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

### 검증 통과: ✅

---

→ 다음: [Step 02: Dual Emitter 수정](step-02-dual-emitter-fix.md)
