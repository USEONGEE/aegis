# Step 02: OpenClaw 플러그인 생성

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅ (패키지 디렉토리 삭제)
- **선행 조건**: Step 01 (Daemon HTTP Tool API)

---

## 1. 구현 내용 (design.md 기반)

- `packages/openclaw-plugin/` 새 패키지 생성
- `package.json` — openclaw 플러그인 메타데이터 설정
- `openclaw.plugin.json` — 플러그인 manifest
- `index.ts` — `definePluginEntry` + 15개 도구 `api.registerTool()` 등록
- 각 도구의 `execute()` 함수에서 `fetch(DAEMON_URL/api/tools/:name)` 호출
- `@sinclair/typebox`로 파라미터 스키마 정의 (ai-tool-schema.ts 기반)
- 환경변수: `DAEMON_TOOL_API_URL`, `TOOL_API_TOKEN`

## 2. 완료 조건
- [ ] `packages/openclaw-plugin/` 디렉토리 존재
- [ ] `packages/openclaw-plugin/package.json`에 `openclaw.extensions` 설정 존재
- [ ] `packages/openclaw-plugin/index.ts`에 15개 `api.registerTool()` 호출 존재
- [ ] 각 도구의 execute()가 daemon HTTP API를 호출하는 fetch 로직 포함
- [ ] TypeScript 컴파일 에러 없음
- [ ] ai-tool-schema.ts의 15개 도구 이름과 플러그인의 도구 이름이 1:1 매칭

## 3. 롤백 방법
- `packages/openclaw-plugin/` 디렉토리 삭제
- 영향 범위: 신규 패키지만 (기존 코드 변경 없음)

---

## Scope

### 신규 생성 파일
```
packages/openclaw-plugin/
├── package.json          # 신규 - npm 패키지 + openclaw 메타데이터
├── openclaw.plugin.json  # 신규 - 플러그인 manifest
├── tsconfig.json         # 신규 - TypeScript 설정
└── index.ts              # 신규 - 플러그인 진입점 + 15개 도구 등록
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| ai-tool-schema.ts | 참조 (변경 없음) | 도구 이름/설명/파라미터 스키마 원본 |
| Step 01 HTTP API | 런타임 의존 | execute()에서 HTTP 호출 대상 |

### Side Effect 위험
- 없음. 완전 독립 패키지.

### 참고할 기존 패턴
- OpenClaw plugin docs: `definePluginEntry`, `api.registerTool()`, `@sinclair/typebox`

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| package.json | 패키지 정의 필수 | ✅ OK |
| openclaw.plugin.json | 플러그인 manifest 필수 | ✅ OK |
| tsconfig.json | TS 컴파일 필수 | ✅ OK |
| index.ts | 도구 등록 진입점 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 15개 도구 등록 | ✅ index.ts | OK |
| HTTP fetch 호출 | ✅ index.ts | OK |
| typebox 스키마 | ✅ index.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: Chat handler 단순화](step-03-chat-handler-simplify.md)
