# Step 02: relay 이중 전달 제거 + event_stream 변환 + app 소비자 전환

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md Phase C + event_stream 승격)

1. `relay/src/routes/ws.ts`에서 영속 채널(chat, control) 직접 forward 코드 제거
   - daemon→app 직접 forward: appBuckets에 직접 send 삭제
   - app→daemon 직접 forward: daemonSocket에 직접 send 삭제
2. `pollControlForApp()`에서 sender=daemon 메시지를 WS type='event_stream'으로 변환
   - 현재: 모든 메시지를 type='control'로 내보냄
   - 변경: sender=daemon이면 type='event_stream'으로 변환
3. `app/src/app/RootNavigator.tsx`에서 event_stream 수신을 channel='event_stream'으로 전환
   - 현재: channel='control' && data.type='event_stream' 전제
   - 변경: channel='event_stream'으로 직접 수신
4. `app/src/domains/chat/screens/ChatDetailScreen.tsx`에서 message_queued/message_started도 channel='event_stream'에서 수신하도록 전환

## 2. 완료 조건
- [ ] relay ws.ts에서 영속 채널 직접 forward 코드 0건
- [ ] pollControlForApp()에서 sender=daemon 메시지가 WS type='event_stream'으로 변환됨
- [ ] app RootNavigator.tsx에서 channel='event_stream'으로 이벤트 수신
- [ ] app ChatDetailScreen.tsx에서 message_queued/message_started가 channel='event_stream'에서 수신
- [ ] `npm test --workspace=packages/relay` 통과
- [ ] `npx tsc --noEmit -p packages/relay` 통과
- [ ] `npx tsc --noEmit -p packages/app` 통과

## 3. 롤백 방법
- git revert — relay + app 변경을 한 커밋으로

---

## Scope

### 수정 대상 파일
```
packages/relay/src/routes/
└── ws.ts  # 수정 — 직접 forward 제거 + pollControlForApp event_stream 변환

packages/app/src/
├── app/RootNavigator.tsx                           # 수정 — event_stream 수신 채널 전환
└── domains/chat/screens/ChatDetailScreen.tsx        # 수정 — message_queued/message_started 채널 전환
```

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| ws.ts | 직접 forward 제거 + event_stream 변환 | ✅ OK |
| RootNavigator.tsx | event_stream 채널 수신 전환 | ✅ OK |
| ChatDetailScreen.tsx | MQ/MS 채널 전환 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| app의 다른 event_stream 소비자 | tsc가 RelayChannel 변경 시 컴파일 에러로 발견 | ✅ OK — tsc로 커버 |

### 검증 통과: ✅

### Side Effect 위험
- 직접 forward 제거 후 poller만으로 메시지 전달 — XREAD BLOCK으로 실시간성 유지 (검증 완료)
- pushToOfflineApps()는 직접 forward와 무관 (Redis XADD 후 호출)

→ 다음: [Step 03: query 채널 추가](step-03-query-channel.md)
