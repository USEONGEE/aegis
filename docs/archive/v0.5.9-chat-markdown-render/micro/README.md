# 작업 티켓 - v0.5.9

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | 패키지 설치 | 🟢 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-23 |
| 02 | MarkdownBubble 컴포넌트 | 🟡 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-23 |
| 03 | ChatDetailScreen 연동 | 🟡 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-23 |

## 의존성

```
01 → 02 → 03
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| AI 응답 마크다운 렌더링 | Step 02, 03 | ✅ |
| 기본 마크다운 문법 지원 | Step 01 (라이브러리), 02 (스타일) | ✅ |
| user 메시지 plain text 유지 | Step 03 (분기) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1~F4: 마크다운 렌더링 | Step 02, 03 | ✅ |
| F5: user plain text | Step 03 | ✅ |
| F6: system/tool 유지 | Step 03 | ✅ |
| F7: 링크 터치 | Step 02 | ✅ |
| N3: 패키지 설치 | Step 01 | ✅ |
| N4: React.memo | Step 02 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| ronradtke 라이브러리 | Step 01 | ✅ |
| MarkdownBubble 분리 | Step 02 | ✅ |
| markdownDarkStyles | Step 02 | ✅ |
| renderMessage 분기 | Step 03 | ✅ |
| React.memo | Step 02 | ✅ |

## Step 상세
- [Step 01: 패키지 설치](step-01-install-dep.md)
- [Step 02: MarkdownBubble 컴포넌트](step-02-markdown-bubble.md)
- [Step 03: ChatDetailScreen 연동](step-03-integrate-screen.md)
