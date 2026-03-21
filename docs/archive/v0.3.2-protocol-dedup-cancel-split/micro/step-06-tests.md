# Step 06: 테스트 업데이트

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 02 (daemon import 변경), Step 03 (cancel 분리)

---

## 1. 구현 내용 (design.md 기반)

- `packages/daemon/tests/control-handler.test.ts`:
  - `SignedApprovalFields`, `ControlMessage` import 경로를 `../src/control-handler.js` → `@wdk-app/protocol`로 변경
  - 기존 cancel 테스트 (있는 경우) 제거 또는 수정
  - `cancel_queued` 테스트 추가:
    - 정상 케이스: 큐에 있는 메시지 취소 → `{ ok: true }`
    - 엣지케이스 E2: 이미 처리 중인 메시지를 cancel_queued → `{ ok: false, reason: 'not_found' }`
    - messageId 누락 시 에러 응답
  - `cancel_active` 테스트 추가:
    - 정상 케이스: 처리 중인 메시지 취소 → `{ ok: true, wasProcessing: true }`
    - 엣지케이스 E3: 큐 대기 중인 메시지를 cancel_active → `{ ok: false, reason: 'not_found' }`
    - messageId 누락 시 에러 응답
- daemon message-queue 테스트 (필요 시 신규 생성):
  - `cancelQueued` 단위 테스트
  - `cancelActive` 단위 테스트

## 2. 완료 조건
- [ ] `packages/daemon/tests/control-handler.test.ts`에서 `cancel_queued` 테스트 존재
- [ ] `packages/daemon/tests/control-handler.test.ts`에서 `cancel_active` 테스트 존재
- [ ] `packages/daemon/tests/control-handler.test.ts`에서 import 경로가 `@wdk-app/protocol` 사용
- [ ] `npx jest --config packages/daemon/jest.config.js --testPathPattern control-handler` 통과 (N3)
- [ ] 엣지케이스 E2 (cancel_queued로 처리 중 메시지 취소 → not_found) 테스트 존재
- [ ] 엣지케이스 E3 (cancel_active로 큐 대기 메시지 취소 → not_found) 테스트 존재

## 3. 롤백 방법
- 롤백 절차: git에서 테스트 파일 복원
- 영향 범위: 테스트만 변경. 프로덕션 코드 무관.

---

## Scope

### 수정 대상 파일
```
packages/daemon/
└── tests/
    └── control-handler.test.ts  # 수정 - import 경로 변경 + cancel_queued/cancel_active 테스트 추가
```

### 신규 생성 파일 (조건부)
```
packages/daemon/
└── tests/
    └── message-queue.test.ts    # 신규 (조건부) - cancelQueued/cancelActive 단위 테스트
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| control-handler.test.ts | 직접 수정 | import 변경 + 테스트 케이스 추가 |
| message-queue.test.ts | 조건부 신규 | cancelQueued/cancelActive 단위 테스트 |
| @wdk-app/protocol | 간접 영향 | 테스트에서 타입 import |
| jest.config.js | 간접 영향 | @wdk-app/protocol moduleNameMapper 설정 필요할 수 있음 |

### Side Effect 위험
- 위험 1: Jest가 `@wdk-app/protocol` 모듈을 resolve하지 못할 수 있음
  - 대응: `jest.config.js`에 `moduleNameMapper` 추가 또는 `moduleDirectories` 설정.
- 위험 2: mock queueManager의 cancel → cancelQueued/cancelActive 메서드 변경 필요
  - 대응: mock 객체 업데이트.

### 참고할 기존 패턴
- `packages/daemon/tests/control-handler.test.ts:1-4`: 기존 import 패턴
- `packages/daemon/tests/control-handler.test.ts:26-43`: mock helper 패턴

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| control-handler.test.ts | import 변경 + cancel 테스트 | ✅ OK |
| message-queue.test.ts (조건부) | cancelQueued/cancelActive 단위 테스트 | ✅ OK (design.md 테스트 전략에 포함) |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| control-handler.test.ts import 변경 | ✅ | OK |
| cancel_queued 테스트 | ✅ | OK |
| cancel_active 테스트 | ✅ | OK |
| E2 엣지케이스 테스트 | ✅ | OK |
| E3 엣지케이스 테스트 | ✅ | OK |
| jest.config.js moduleNameMapper | ❌ 조건부 | Jest resolve 실패 시 추가 필요 |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅
