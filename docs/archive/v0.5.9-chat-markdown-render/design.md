# 설계 - v0.5.9 Chat Markdown 렌더링

## 변경 규모
**규모**: 일반 기능
**근거**: 외부 의존성 추가 + 신규 컴포넌트 2개 생성 + 기존 렌더링 경로 교체

---

## 문제 요약
AI 응답이 `<Text>{item.content}</Text>`로 plain text 렌더링됨. OpenClaw/Claude가 반환하는 마크다운이 원시 텍스트로 표시되어 구조화된 정보의 가독성 없음.

> 상세: [README.md](README.md) 참조

## 접근법
assistant 메시지만 마크다운 렌더링 컴포넌트로 교체. user/system/tool 메시지는 기존 유지.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: `@ronradtke/react-native-markdown-display` | Expo 즉시 호환, 네이티브 모듈 없음, StyleSheet 커스텀 직관적 | fork 관리 불확실 (2025-01 마지막 배포) | ✅ |
| B: `react-native-marked` | 가장 활발 (2026-03), marked 파서 빠름 | `react-native-svg` 필수 추가, 의존성 6개+, Renderer 커스텀 복잡 | ❌ |
| C: 자체 구현 (regex) | 외부 의존성 0 | edge case 극다, 테이블/리스트 중첩 구현 비용 10x+, 영구 유지보수 부담 | ❌ |

**선택 이유**: A는 네이티브 모듈 없이 Expo 바로 사용 가능. 의존성 최소(markdown-it 등 3개). 스타일 오버라이드가 RN StyleSheet 문법 그대로라 기존 다크테마와 통합 용이. fork 관리 중단 시 B로 교체 비용도 낮음(인터페이스 유사).

## 기술 결정

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| 1 | 라이브러리 | `@ronradtke/react-native-markdown-display` | Expo 호환, 네이티브 모듈 없음 |
| 2 | 적용 대상 | `role === 'assistant'`만 | user/system은 plain text 유지 |
| 3 | 컴포넌트 분리 | `MarkdownBubble` 신규 | 마크다운 스타일+로직 격리 |
| 4 | 스타일 | `markdownDarkStyles.ts` 별도 파일 | 기존 다크테마 톤 일치 |
| 5 | 스트리밍 최적화 | `React.memo` | content 동일한 이전 메시지 리렌더 방지 |
| 6 | 코드 문법 강조 | 미포함 | 모노스페이스+배경색만. syntax highlighting은 후속 |
| 7 | 이미지 | 비활성 | PRD 비목표 |
| 8 | 링크 | `Linking.openURL` | 외부 브라우저로 열기 |

## 아키텍처 개요

```
변경 전:
  renderMessage() → <Text>{item.content}</Text>

변경 후:
  renderMessage()
    ├─ role === 'user'      → <Text>{item.content}</Text>  (유지)
    ├─ role === 'system'    → <Text>{item.content}</Text>  (유지)
    └─ role === 'assistant' → <MarkdownBubble content={item.content} />
```

```
파일 구조:
  packages/app/src/domains/chat/
    ├─ screens/
    │   └─ ChatDetailScreen.tsx       ← renderMessage 분기 수정
    └─ components/
        ├─ MarkdownBubble.tsx         ← 신규
        └─ markdownDarkStyles.ts      ← 신규
```

## 테스트 전략

| 레벨 | 대상 | 방법 |
|------|------|------|
| tsc | 타입 안전 | `npx tsc --noEmit` |
| 수동 | 마크다운 렌더링 | AI에게 헤딩/볼드/코드블록/목록/테이블 포함 응답 유도 |
| 수동 | 스트리밍 | 응답 스트리밍 중 끊김/깜빡임 확인 |
| 수동 | user 메시지 | 여전히 plain text인지 확인 |
| 수동 | 링크 | 마크다운 내 링크 터치 시 외부 브라우저 열리는지 확인 |

## 리스크/오픈 이슈

| # | 이슈 | 대응 |
|---|------|------|
| 1 | 스트리밍 장문(3000+ 토큰) 파싱 성능 | 측정 후 문제 시 throttle 또는 스트리밍 중 plain text 전환 |
| 2 | fork 관리 중단 | react-native-marked로 교체 비용 낮음 |
| 3 | 불완전 마크다운 (스트리밍 중간) | `**bol` 같은 미완성 토큰 잠시 노출. done 시점에 완성. 체감 미미 |
