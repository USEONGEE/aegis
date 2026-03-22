# Step 02: MarkdownBubble 컴포넌트 + 다크 스타일

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: Step 01 (패키지 설치)

## 1. 구현 내용
- `MarkdownBubble.tsx` 신규 생성 — Markdown 래퍼 + React.memo
- `markdownDarkStyles.ts` 신규 생성 — 다크테마 마크다운 스타일시트
- 링크 터치 시 `Linking.openURL` 연결

## 2. 완료 조건
- [x] `packages/app/src/domains/chat/components/MarkdownBubble.tsx` 존재
- [x] `packages/app/src/domains/chat/components/markdownDarkStyles.ts` 존재
- [x] MarkdownBubble이 `React.memo`로 래핑됨
- [x] 스타일이 기존 다크테마(#ffffff 텍스트, #1a1a1a 배경)와 톤 일치
- [x] `npx tsc --noEmit` 에러 0

## 3. 롤백 방법
- 두 파일 삭제

## Scope

### 신규 생성 파일
```
packages/app/src/domains/chat/components/
├── MarkdownBubble.tsx         # 신규 - Markdown 래퍼 컴포넌트
└── markdownDarkStyles.ts      # 신규 - 다크테마 스타일
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `@ronradtke/react-native-markdown-display` | import | Step 01에서 설치 |
| `react-native/Linking` | import | 링크 열기용 |

### Side Effect 위험
- 없음. 아직 ChatDetailScreen에서 import하지 않음.

## FP/FN 검증

### 검증 체크리스트
- [x] 신규 파일 2개만 생성 — OK
- [x] 기존 파일 수정 없음 — OK

### 검증 통과: ✅

---
→ 다음: [Step 03: ChatDetailScreen 연동](step-03-integrate-screen.md)
