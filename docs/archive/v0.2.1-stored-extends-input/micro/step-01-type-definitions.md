# Step 01: 타입 정의 변경

## 메타데이터
- **소유 DoD**: F1, F2, F3
- **수정 파일**: `packages/guarded-wdk/src/approval-store.ts`
- **의존성**: 없음 (첫 번째 Step)

## 구현 내용
1. `StoredCron extends CronInput` — sessionId, interval, prompt, chainId 4개 필드 제거
2. `StoredJournal extends JournalInput` — intentHash, accountIndex, chainId, targetHash, status 5개 필드 제거
3. `StoredPolicy extends PolicyInput` — policiesJson/signatureJson 제거, policies/signature 상속

## 완료 조건
- [ ] F1: `interface StoredCron extends CronInput` 선언, 중복 필드 없음
- [ ] F2: `interface StoredJournal extends JournalInput` 선언, 중복 필드 없음
- [ ] F3: `interface StoredPolicy extends PolicyInput` 선언, policiesJson/signatureJson 필드 없음

## FP/FN 검증
- **FP (과잉)**: 없음. approval-store.ts 한 파일만 수정.
- **FN (누락)**: 없음. 3개 타입 모두 이 파일에 정의됨. index.ts re-export는 타입명 변경이 아니므로 수정 불필요.
