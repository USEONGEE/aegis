# Step 14: chat streaming 소비 (Gap 20)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `ChatScreen.tsx`에서 3가지 streaming 메시지 타입 처리:
  - `typing` → 타이핑 인디케이터 표시
  - `stream` → delta를 실시간으로 메시지에 append
  - `error` → 에러 메시지 표시
- 현재는 완성된 메시지만 표시 → streaming 지원으로 UX 개선

## 2. 완료 조건
- [ ] ChatScreen에 `typing` 메시지 처리 (인디케이터 표시/숨김) 존재
- [ ] ChatScreen에 `stream` 메시지 처리 (delta append) 존재
- [ ] ChatScreen에 `error` 메시지 처리 (에러 표시) 존재
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: app 패키지만

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/chat/screens/
└── ChatScreen.tsx              # typing/stream/error 메시지 타입 처리 추가
```

### Side Effect 위험
- Metro bundler 의존 → RN 테스트 어려움 → 코드 검사 + expo export로 검증

## FP/FN 검증

### 검증 통과: ✅
- daemon의 chat-handler는 이미 typing/stream/error를 전송하므로 수정 불필요 (OK)
- relay는 투명 전달 (OK)

---

> 다음: [Step 15: chmod 600](step-15-chmod.md)
