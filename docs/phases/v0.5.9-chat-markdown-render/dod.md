# DoD (Definition of Done) - v0.5.9

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | assistant 메시지에서 `**bold**`가 굵은 글씨로 렌더링됨 | 수동: AI에게 bold 포함 응답 유도 후 화면 확인 |
| F2 | assistant 메시지에서 `# heading`이 크기 차등 헤딩으로 렌더링됨 | 수동: h1/h2/h3 포함 응답 유도 |
| F3 | assistant 메시지에서 `` `code` ``가 모노스페이스+배경색으로 렌더링됨 | 수동: 인라인 코드 + 코드 블록 포함 응답 유도 |
| F4 | assistant 메시지에서 목록(ordered/unordered)이 들여쓰기+불릿으로 렌더링됨 | 수동: 목록 포함 응답 유도 |
| F5 | user 메시지는 기존 plain text 렌더링 유지 | 수동: `**bold**` 텍스트 입력 → 원시 텍스트로 표시 확인 |
| F6 | system/tool 메시지는 기존 렌더링 유지 | 수동: 도구 실행 상태 메시지가 기존과 동일한지 확인 |
| F7 | 마크다운 내 링크 터치 시 외부 브라우저로 열림 | 수동: URL 포함 응답에서 링크 터치 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | TypeScript strict 모드 에러 0 | `cd packages/app && npx tsc --noEmit` |
| N2 | 빌드 성공 | `cd packages/app && npx expo export --platform ios 2>&1 | tail -5` |
| N3 | `@ronradtke/react-native-markdown-display` 패키지 설치됨 | `grep ronradtke packages/app/package.json` |
| N4 | MarkdownBubble 컴포넌트가 React.memo로 래핑됨 | 코드 확인: `export default React.memo(MarkdownBubble)` |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | 빈 문자열 content | 빈 버블 표시 (크래시 없음) | 수동: 빈 응답 시나리오 |
| E2 | 마크다운 없는 plain text 응답 | 기존과 동일하게 표시 | 수동: 단순 텍스트 응답 확인 |
| E3 | 스트리밍 중 불완전 마크다운 (`**bol`) | 미완성 토큰이 원시 표시, done 시점에 완성 | 수동: 스트리밍 관찰 |
| E4 | 매우 긴 코드 블록 | 가로 스크롤 없이 줄바꿈 표시 (앱 크래시 없음) | 수동: 긴 코드 블록 응답 유도 |

## 커버리지 확인

### PRD 목표 → DoD

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| AI 응답을 마크다운으로 렌더링 | F1, F2, F3, F4 | ✅ |
| 기본 마크다운 문법 지원 | F1~F4, F7 | ✅ |
| user 메시지는 plain text 유지 | F5 | ✅ |

### 설계 결정 → DoD

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| ronradtke 라이브러리 | N3 | ✅ |
| assistant만 적용 | F5, F6 | ✅ |
| React.memo 최적화 | N4 | ✅ |
| 링크 Linking.openURL | F7 | ✅ |
