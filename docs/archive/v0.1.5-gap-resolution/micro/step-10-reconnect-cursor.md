# Step 10: reconnect cursor (Gap 6)

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- daemon `relay-client.ts`: authenticate 시 `lastStreamId` 전송
- relay `ws.ts`: `lastStreamId`가 있으면 해당 ID부터 stream 읽기 (`$` 대신)
- chat stream도 polling 대상에 추가
- 재연결 시 누락 메시지 없이 이어서 수신

## 2. 완료 조건
- [ ] daemon relay-client가 authenticate 시 `lastStreamId` 필드 포함
- [ ] relay ws.ts가 `lastStreamId` 기반으로 stream 읽기 시작
- [ ] reconnect 시나리오 테스트: 연결 끊김 → 재연결 → 누락 메시지 수신 확인
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: daemon (relay-client) + relay (ws)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── relay-client.ts             # authenticate에 lastStreamId 추가

packages/relay/src/routes/
└── ws.ts                       # lastStreamId 기반 stream 읽기
```

### Side Effect 위험
- lastStreamId가 만료된 Redis stream ID인 경우 에러 → fallback to `$` 필요

## FP/FN 검증

### 검증 통과: ✅
- app의 RelayClient도 동일 패턴이 필요할 수 있으나, app은 WS 재연결 시 별도 처리 (OK)

---

> 다음: [Step 11: SqliteStore 기본값](step-11-sqlite-default.md)
