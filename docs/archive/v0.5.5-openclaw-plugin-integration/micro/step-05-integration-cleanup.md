# Step 05: 통합 테스트 + 의존성 정리

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 01, 02, 03, 04

---

## 1. 구현 내용 (design.md 기반)

- E2E 통합 테스트 수행 (Docker Compose 환경)
- 세션 유지 테스트 (연속 대화 맥락 참조)
- daemon `package.json`에서 `@anthropic-ai/sdk` 제거
- `openai` 패키지 사용 여부 확인 후 미사용 시 제거
- CLAUDE.md 업데이트 (v0.5.5 상태 반영)

## 2. 완료 조건
- [ ] Docker Compose 전체 기동 후 OpenClaw에 채팅 → 도구 호출 → 응답 정상 수신
- [ ] 같은 user로 연속 2회 호출 시 이전 대화 참조 성공
- [ ] `grep "anthropic" packages/daemon/package.json` → 결과 없음
- [ ] `npx tsc --noEmit` 에러 0 (daemon 패키지)
- [ ] `docker compose up -d` → 전체 스택 정상 기동
- [ ] CLAUDE.md에 v0.5.5 상태 업데이트됨

## 3. 롤백 방법
- 의존성 제거: `npm install @anthropic-ai/sdk` 로 복구
- 영향 범위: daemon package.json

---

## Scope

### 수정 대상 파일
```
packages/daemon/package.json  # 수정 - @anthropic-ai/sdk 제거
CLAUDE.md                      # 수정 - 페이즈 상태 업데이트
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| package.json | 의존성 제거 | @anthropic-ai/sdk |
| CLAUDE.md | 문서 업데이트 | 프로젝트 상태 반영 |

### Side Effect 위험
- @anthropic-ai/sdk가 다른 패키지에서 사용 중이면 제거 불가 → 확인 필요

## FP/FN 검증

### 검증 통과: ✅

---

→ Phase 완료
