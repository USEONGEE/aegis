# Step 04: Docker 구성 변경

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (docker-compose.yml + Dockerfile 원복)
- **선행 조건**: Step 01, Step 02

---

## 1. 구현 내용 (design.md 기반)

- `docker/openclaw.Dockerfile` 신규 생성:
  - `FROM ghcr.io/openclaw/openclaw:latest`
  - 플러그인 COPY + 설치
  - `/v1/responses` endpoint 활성화 config
  - daemon agent 생성 + `tools.profile: minimal` 설정
- `docker-compose.yml` 변경:
  - openclaw 서비스: `image` → `build` (커스텀 Dockerfile)
  - daemon 서비스: `TOOL_API_PORT`, `TOOL_API_TOKEN` 환경변수 추가
  - daemon 서비스: `ANTHROPIC_*` 환경변수 제거
- `.env.example` 업데이트 (있다면)

## 2. 완료 조건
- [ ] `docker/openclaw.Dockerfile` 파일 존재
- [ ] `docker compose build` 성공
- [ ] `docker compose up -d` → 모든 서비스 running
- [ ] OpenClaw 컨테이너에 WDK 플러그인 설치 확인: `docker exec openclaw openclaw plugins list` 에서 플러그인 표시
- [ ] daemon 컨테이너에서 HTTP Tool API 응답: `docker exec daemon curl localhost:18790/health` → `{"ok":true}`
- [ ] `docker-compose.yml`에 `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` 없음

## 3. 롤백 방법
- docker-compose.yml 원복, Dockerfile 삭제
- `docker compose up -d --build`
- 영향 범위: Docker 구성만

---

## Scope

### 수정 대상 파일
```
docker-compose.yml     # 수정 - openclaw build, daemon env vars
```

### 신규 생성 파일
```
docker/
└── openclaw.Dockerfile  # 신규 - 커스텀 OpenClaw 이미지
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| docker-compose.yml | 직접 수정 | 서비스 구성 변경 |
| Step 02 플러그인 | 빌드 의존 | Dockerfile에서 COPY |

### Side Effect 위험
- OpenClaw 이미지 빌드 시간 증가 (기존: pull만, 변경: build 필요)
- `.docker-data/openclaw/` 기존 데이터와 호환 확인 필요

## FP/FN 검증

### 검증 통과: ✅

---

→ 다음: [Step 05: 통합 테스트 + 정리](step-05-integration-cleanup.md)
