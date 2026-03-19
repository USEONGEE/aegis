# Step 09: device list + balance + position via chat (Gap 18+19)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 07

---

## 1. 구현 내용 (design.md 기반)
- app 화면을 chat 결과 기반으로 재설계
- Dashboard (잔고/포지션): `event_stream`의 `ExecutionSettled`/`ExecutionBroadcasted` → zustand 갱신. 수동 새로고침 시 chat으로 "잔고 조회" → AI tool(`getBalance`) 결과 → zustand 갱신
- Settings (device list): chat으로 "내 디바이스 목록" → AI tool 결과 → zustand 갱신
- 공통 패턴: chat 결과를 zustand에 normalize. 별도 control 메시지 타입 안 만듦. wdk-admin 경유 안 함

## 2. 완료 조건
- [ ] DashboardScreen이 `event_stream` 이벤트로 zustand 갱신하는 코드 존재
- [ ] DashboardScreen 수동 새로고침 시 chat 기반 조회 코드 존재
- [ ] SettingsScreen이 chat 기반 device list 조회 코드 존재
- [ ] zustand store에 balance/position/deviceList normalize 로직 존재
- [ ] `npx tsc --noEmit -p packages/app/tsconfig.json` 통과
- [ ] `npm test` 전체 통과

## 3. 롤백 방법
- git revert
- 영향: app 패키지만

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/dashboard/screens/
└── DashboardScreen.tsx          # event_stream 구독 + chat 기반 잔고/포지션 조회

packages/app/src/domains/settings/screens/
└── SettingsScreen.tsx           # chat 기반 device list 조회

packages/app/src/stores/
├── useActivityStore.ts          # event_stream 이벤트 처리
└── useDashboardStore.ts         # balance/position/deviceList normalize (신규 또는 기존 확장)
```

### Side Effect 위험
- Dashboard/Settings UI가 chat 의존으로 변경 → 오프라인 시 캐시된 데이터만 표시

## FP/FN 검증

### 검증 통과: ✅
- daemon은 데이터 조회 AI tool이 이미 구현되어 있으므로 수정 불필요 (OK)
- relay는 투명 전달 (OK)

---

> 다음: [Step 10: reconnect cursor](step-10-reconnect-cursor.md)
