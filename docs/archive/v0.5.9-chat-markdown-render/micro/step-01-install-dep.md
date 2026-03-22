# Step 01: 패키지 설치

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (`npm uninstall`)
- **선행 조건**: 없음

## 1. 구현 내용
- `@ronradtke/react-native-markdown-display` 패키지 설치

## 2. 완료 조건
- [x] `packages/app/package.json`에 `@ronradtke/react-native-markdown-display` 의존성 존재
- [x] `npx expo install` 성공 (Expo 호환 버전 자동 해결)

## 3. 롤백 방법
- `cd packages/app && npm uninstall @ronradtke/react-native-markdown-display`

## Scope

### 수정 대상 파일
```
packages/app/
└── package.json        # 수정 - 의존성 추가
```

### 신규 생성 파일
없음

### Side Effect 위험
- 없음. pure JS 패키지, 네이티브 모듈 없음.

## FP/FN 검증

### 검증 체크리스트
- [x] package.json만 수정 — OK
- [x] 네이티브 모듈 없음 확인 — OK

### 검증 통과: ✅

---
→ 다음: [Step 02: MarkdownBubble 컴포넌트](step-02-markdown-bubble.md)
