# Step 32: relay - 통합 테스트

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 26~31 (relay 전체)

---

## 1. 구현 내용 (design.md + dod.md 기반)

Relay 서버의 전체 통합 테스트. docker-compose로 Redis + PostgreSQL을 띄운 상태에서 queue + routing + reconnect + offline queue + push를 검증한다.

**DoD 대상 항목**:
- F37: daemon outbound WebSocket 연결
- F38: RN App WebSocket + REST 연결
- F39: control_channel user 스코프 전달
- F40: chat_queue session 스코프 전달
- F42: daemon 오프라인 시 큐 보관 + 온라인 시 전달
- F43: docker-compose 3개 서비스 healthy
- F44: pairing 시 devices 테이블 row 생성
- F45: sessions 테이블 row 생성
- F46: reconnect 시 올바른 daemon 라우팅
- F47: registry 데이터 Relay 재시작 후 유지

## 2. 완료 조건
- [ ] `docker-compose up -d` → 3개 서비스(relay, redis, postgres) healthy
- [ ] daemon mock client가 `/ws/daemon`에 WebSocket 연결 성공
- [ ] app mock client가 `/ws/app`에 WebSocket 연결 성공
- [ ] control_channel 메시지가 session 무관하게 daemon에 전달됨
- [ ] chat_queue 메시지가 session A → session B에 미전달 (session 스코프 격리)
- [ ] daemon 오프라인 시 메시지가 RedisQueue에 보관됨
- [ ] daemon 재연결 시 cursor 이후 누락 메시지 수신
- [ ] pairing API 호출 → devices 테이블 row 존재 확인 (SQL SELECT)
- [ ] session 생성 → sessions 테이블 row 존재 확인 (SQL SELECT)
- [ ] relay 프로세스 재시작 후 PostgreSQL 데이터 유지 확인
- [ ] 푸시 알림: app offline + control 메시지 → Expo Push API 호출됨 (mock 검증)
- [ ] `npm test -- packages/relay` 전체 통과 (단위 + 통합)

## 3. 롤백 방법
- `tests/integration/` 디렉토리 삭제

---

## Scope

### 신규 생성 파일
```
packages/relay/
  tests/
    integration/
      relay-integration.test.js    # 전체 통합 테스트
      helpers/
        mock-daemon.js             # daemon WebSocket mock client
        mock-app.js                # app WebSocket mock client
```

### 수정 대상 파일
```
packages/relay/package.json        # test script 업데이트 (통합 테스트 포함)
```

### Side Effect 위험
- docker-compose 실행 필요 (CI에서는 service container 활용)
- 포트 충돌 가능 (테스트용 포트 분리 필요)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| relay-integration.test.js | 통합 테스트 전체 | ✅ OK |
| mock-daemon.js | daemon WS mock | ✅ OK |
| mock-app.js | app WS mock | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| queue 라우팅 검증 | ✅ integration test | OK |
| reconnect + cursor sync 검증 | ✅ integration test | OK |
| offline queue 검증 | ✅ integration test | OK |
| registry 영속 검증 | ✅ integration test | OK |
| push notification 검증 | ✅ integration test | OK |
| docker-compose healthy 검증 | ✅ integration test | OK |

### 검증 통과: ✅

---

→ 다음: [Step 33: app - Expo 프로젝트 셋업](step-33-app-setup.md)
