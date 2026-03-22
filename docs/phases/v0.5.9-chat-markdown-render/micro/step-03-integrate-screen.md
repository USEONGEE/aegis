# Step 03: ChatDetailScreen 연동

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (import 제거 + Text 복원)
- **선행 조건**: Step 02 (MarkdownBubble 컴포넌트)

## 1. 구현 내용
- ChatDetailScreen.tsx의 renderMessage에서 assistant 메시지 분기
- `role === 'assistant'` → `<MarkdownBubble content={item.content} />`
- user/system/tool 메시지는 기존 `<Text>` 유지

## 2. 완료 조건
- [x] assistant 메시지가 MarkdownBubble로 렌더링됨
- [x] user 메시지가 여전히 plain `<Text>`로 렌더링됨
- [x] system/tool 메시지가 기존과 동일
- [x] `npx tsc --noEmit` 에러 0

## 3. 롤백 방법
- MarkdownBubble import 제거
- `<Text style={styles.messageText}>{item.content}</Text>` 복원

## Scope

### 수정 대상 파일
```
packages/app/src/domains/chat/screens/
└── ChatDetailScreen.tsx   # 수정 - renderMessage 분기 + import 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| MarkdownBubble | import 추가 | Step 02에서 생성 |

### Side Effect 위험
- renderMessage 변경으로 FlatList 리렌더 패턴 변경 가능 — React.memo로 대응

## FP/FN 검증

### 검증 체크리스트
- [x] ChatDetailScreen.tsx만 수정 — OK
- [x] renderMessage 내 assistant 분기만 변경 — OK
- [x] user/system/tool 경로 미변경 — OK

### 검증 통과: ✅
