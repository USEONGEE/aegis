# Step 04: DashboardScreen 연결

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 03

---

## 1. 구현 내용
- DashboardScreen에서 mount 시 query 채널로 getPortfolio 호출
- pull-to-refresh에서 AI 채팅 대신 getPortfolio query 호출
- query_result 수신 시 balances 업데이트

## 2. 완료 조건
- [ ] DashboardScreen mount 시 relay.sendQuery('getPortfolio', ...) 호출됨
- [ ] pull-to-refresh 시 getPortfolio query 재호출됨
- [ ] query_result에서 balances 수신 시 화면에 표시됨
- [ ] totalUSD가 모든 토큰 usdValue 합산으로 계산됨
- [ ] 기존 event_stream 기반 업데이트도 유지됨
- [ ] tsc --noEmit 통과 (app)

## 3. 롤백 방법
- git checkout packages/app/src/domains/dashboard/screens/DashboardScreen.tsx

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/dashboard/screens/
└── DashboardScreen.tsx  # query 호출 + 결과 수신 로직 추가
```

### Side Effect 위험
- DashboardScreen 수정 — 기존 event_stream 핸들러는 유지, query 흐름 추가

---
