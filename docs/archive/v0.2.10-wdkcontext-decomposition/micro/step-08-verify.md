# Step 08: 최종 검증 (tsc --noEmit + DoD 체크)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: N/A (검증 단계, 코드 변경 없음)
- **선행 조건**: Step 01-07 모두 완료

---

## 1. 구현 내용 (design.md 12단계 기반)

코드 변경 없음. Step 01-07의 결과를 일괄 검증한다.

- `tsc --noEmit` 실행하여 컴파일 에러 확인
- DoD의 F1-F11, N1-N3, E1-E4 항목을 순서대로 검증
- 성공 지표 (design.md 11절) 검증

## 2. 완료 조건

### 기능 완료 (DoD F1-F11)
- [ ] F1: `rg 'WDKContext' packages/daemon/src/ --type ts` 결과 0건
- [ ] F2: `rg 'broker: ApprovalBrokerPort' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] F3: `rg 'store: ToolStorePort' packages/daemon/src/tool-surface.ts` 결과 1건
- [ ] F4: ToolStorePort에 9개 메서드 정의됨
- [ ] F5: ApprovalBrokerPort에 createRequest 1개만 정의됨
- [ ] F6: `rg 'wdkContext' packages/daemon/src/admin-server.ts` 결과 0건
- [ ] F7: `rg 'AdminStorePort' packages/daemon/src/admin-server.ts` 결과 1건 이상
- [ ] F8: `rg 'relayClient' packages/daemon/src/tool-surface.ts` 결과 0건
- [ ] F9: `rg 'ToolExecutionContext' packages/daemon/src/tool-call-loop.ts` 결과 1건 이상
- [ ] F10: `rg 'ToolExecutionContext' packages/daemon/src/chat-handler.ts` 결과 1건 이상
- [ ] F11: `rg 'ToolExecutionContext' packages/daemon/src/cron-scheduler.ts` 결과 1건 이상

### 비기능 완료 (DoD N1-N3)
- [ ] N1: `npx tsc -p packages/daemon/tsconfig.json --noEmit --pretty false 2>&1 | grep 'error TS' | wc -l` 결과가 기존 baseline(4) 이하
- [ ] N2: `rg 'broker: any|store: any' packages/daemon/src/ --type ts` 결과 0건
- [ ] N3: 타입 그래프에 Port 노드 존재 (해당 스크립트 존재 시)

### 엣지케이스 (DoD E1-E4)
- [ ] E1: SqliteApprovalStore -> ToolStorePort 구조적 호환 (N1 검증으로 확인)
- [ ] E2: SqliteApprovalStore -> AdminStorePort 구조적 호환 (N1 검증으로 확인)
- [ ] E3: CronStore와 ToolStorePort 중복 메서드 충돌 없음 (N1 검증으로 확인)
- [ ] E4: `rg 'Port' packages/daemon/src/control-handler.ts` 결과 0건

### 성공 지표 (design.md 11절)
- [ ] `rg 'any' packages/daemon/src/tool-surface.ts`에서 `broker: any`, `store: any` 없음
- [ ] `rg 'any' packages/daemon/src/admin-server.ts`에서 `store: any` 없음
- [ ] `rg 'WDKContext' packages/daemon/src/` 결과 0건
- [ ] `rg 'relayClient' packages/daemon/src/tool-surface.ts` 결과 0건
- [ ] admin-server.ts에 wdkContext 관련 코드 없음

## 3. 롤백 방법

- N/A (검증 단계)

---

## Scope

### 수정 대상 파일
없음 (검증만)

### 신규 생성 파일
없음

### 의존성 분석
없음

### Side Effect 위험
없음

---

## FP/FN 검증

### False Positive (과잉)
없음 (코드 변경 없음)

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| tsc --noEmit | ✅ 검증 명령 | OK |
| DoD F1-F11 검증 | ✅ 완료 조건에 포함 | OK |
| DoD N1-N3 검증 | ✅ 완료 조건에 포함 | OK |
| DoD E1-E4 검증 | ✅ 완료 조건에 포함 | OK |

### 검증 체크리스트
- [x] 모든 DoD 항목이 검증 절차에 포함됨
- [x] 성공 지표가 검증 절차에 포함됨

### 검증 통과: ✅
