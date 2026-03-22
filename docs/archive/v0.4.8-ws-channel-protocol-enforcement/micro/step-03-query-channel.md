# Step 03: query/query_result 채널 추가

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 01 (protocol 타입 기반)

---

## 1. 구현 내용 (design.md Phase D)

1. `protocol/src/query.ts` 신규 — QueryType(4종), QueryMessage DU, QueryResult(ok|error)
2. `protocol/src/relay.ts` — RelayChannel에 'event_stream', 'query', 'query_result' 추가
3. `protocol/src/index.ts` — query 타입 export 추가
4. `relay/src/routes/ws.ts` — query/query_result WS 직접 전달 라우팅 + daemon 오프라인 에러
5. `daemon/src/query-handler.ts` 신규 — 4종 query 처리
6. `daemon/src/ports.ts` — QueryFacadePort 추가 (필요 시)
7. `daemon/src/index.ts` — query 수신 시 query-handler 호출 → query_result 전송
8. `app/src/core/relay/RelayClient.ts` — query() 메서드 + pendingQueries 맵 + query_result 수신 핸들러

## 2. 완료 조건
- [ ] `packages/protocol/src/query.ts` 파일 존재, QueryType 4종 정의
- [ ] RelayChannel이 5종으로 확장됨
- [ ] relay에서 query가 Redis 미경유, daemon 소켓에 직접 전달
- [ ] relay에서 daemon 오프라인 시 query_result(error='daemon_offline') 평문 응답
- [ ] daemon query-handler가 policyList, pendingApprovals, signerList, walletList 처리
- [ ] app RelayClient.query() 메서드가 requestId 기반 Promise + timeout 동작
- [ ] `npm test --workspace=packages/daemon` 통과 (query-handler 테스트)
- [ ] `npm test --workspace=packages/relay` 통과 (query 라우팅 테스트)
- [ ] `npx tsc --noEmit -p packages/protocol` 통과
- [ ] `npx tsc --noEmit -p packages/app` 통과

## 3. 롤백 방법
- git revert — 신규 파일 삭제 + 수정 파일 revert

---

## Scope

### 수정 대상 파일
```
packages/protocol/src/
├── query.ts   # 신규 — QueryType, QueryMessage, QueryResult
├── relay.ts   # 수정 — RelayChannel 확장
└── index.ts   # 수정 — query export 추가

packages/relay/src/routes/
└── ws.ts      # 수정 — query/query_result 직접 전달 라우팅

packages/daemon/src/
├── query-handler.ts  # 신규 — 4종 query 처리
├── ports.ts          # 수정 — QueryFacadePort 추가 (필요 시)
└── index.ts          # 수정 — query 수신 → query-handler 연결

packages/app/src/core/relay/
└── RelayClient.ts    # 수정 — query() + pendingQueries + query_result 수신
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| query.ts | QueryType, QueryMessage, QueryResult 정의 | ✅ OK |
| relay.ts | RelayChannel 확장 | ✅ OK |
| index.ts | query export | ✅ OK |
| ws.ts | query 라우팅 + daemon_offline | ✅ OK |
| query-handler.ts | 4종 query 처리 | ✅ OK |
| ports.ts | QueryFacadePort | ✅ OK |
| daemon/index.ts | query handler 연결 | ✅ OK |
| RelayClient.ts | query() + pendingQueries | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| wdk-host.ts facade 메서드 | ports.ts 변경 시 tsc가 구현 누락 발견 | ✅ OK — tsc로 커버 |

### 검증 통과: ✅

### Side Effect 위험
- query/query_result는 새 채널이므로 기존 코드에 영향 없음
- daemon ports.ts 변경 시 wdk-host.ts 구현 확인 필요

→ 다음: [Step 04: protocol 타입 강제 적용](step-04-type-enforcement.md)
