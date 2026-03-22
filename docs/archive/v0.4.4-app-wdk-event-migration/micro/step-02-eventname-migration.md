# Step 02: eventName → event.type 마이그레이션

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

## 1. 구현 내용
- DashboardScreen: `data.eventName` → `data.event.type` 변경
- SettingsScreen: `data.eventName` → `data.event.type` 변경
- event payload 접근도 `data.event.xxx` 형태로 반영 (v0.4.2에서 eventName 삭제, event가 AnyWDKEvent)

## 2. 완료 조건
- [ ] DashboardScreen에서 eventName 참조 없음
- [ ] SettingsScreen에서 eventName 참조 없음
- [ ] `grep -r "eventName" packages/app/src/` 결과 0건
- [ ] tsc 통과

## 3. 롤백 방법
- git revert (2개 화면 파일만)

## Scope

### 수정 대상 파일
```
packages/app/src/domains/dashboard/screens/
└── DashboardScreen.tsx  # 수정 — eventName → event.type

packages/app/src/domains/settings/screens/
└── SettingsScreen.tsx   # 수정 — eventName → event.type
```

## FP/FN 검증
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP) 없음
- [x] 누락된 파일(FN) 없음

→ 다음: [Step 03](step-03-activity-ingest.md)
