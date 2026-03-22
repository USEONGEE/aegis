# DoD (Definition of Done) - v0.4.7

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | A1 31건의 `export` 키워드가 제거됨 (심볼 자체는 파일에 유지) | `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 후 해당 31건이 목록에서 사라짐 |
| F2 | A2 4건의 dead code가 삭제됨: `switchSeed` 함수, `UnsignedIntent` 인터페이스, `E2ECrypto.ts` 파일, `TxApprovalStatus` 타입 | (1) `rg 'switchSeed' packages/daemon/src/wdk-host.ts` → 0건 (2) `rg 'UnsignedIntent' packages/app/src/core/approval/types.ts` → 0건 (3) `ls packages/app/src/core/crypto/E2ECrypto.ts` → 파일 없음 (4) `rg 'TxApprovalStatus' packages/app/src/shared/tx/TxApprovalContext.tsx` → 0건 |
| F3 | guarded-wdk index.ts에서 모노레포 내 미사용 re-export가 제거됨 | dead-exports 체크에서 guarded-wdk의 index.ts 경유 violation 0건 (manifest 관련 import 제외) |
| F4 | protocol index.ts에서 미사용 유니온 멤버 개별 re-export가 제거됨 | dead-exports 체크에서 protocol의 index.ts 경유 violation 0건 |
| F5 | canonical index.ts에서 미사용 re-export 3건 제거됨 | dead-exports 체크에서 canonical의 index.ts 경유 violation 0건 |
| F6 | CI `cross/dead-exports` violation이 허용 예외만 남음: manifest 9건(외부 SDK) + app 2건(App.tsx false positive — checker가 src/ 외 소비를 미감지) + guarded-wdk 1건(JsonWdkStore 대안 구현체) | `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 → 총 수 ≤ 12, 남은 항목이 모두 위 3가지 허용 예외에 해당 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk tsc 통과 | `npx tsc --noEmit -p packages/guarded-wdk/tsconfig.json` → 에러 0 |
| N2 | daemon tsc 통과 | `npx tsc --noEmit -p packages/daemon/tsconfig.json` → 에러 0 |
| N3 | app tsc 통과 | `npx tsc --noEmit -p packages/app/tsconfig.json` → 에러 0 |
| N4 | protocol tsc 통과 | `npx tsc --noEmit -p packages/protocol/tsconfig.json` → 에러 0 |
| N5 | canonical tsc 통과 | `npx tsc --noEmit -p packages/canonical/tsconfig.json` → 에러 0 |
| N6 | 기존 16개 PASS CI 체크 퇴행 없음 | `npx tsx scripts/check/index.ts` → 기존 PASS 체크가 FAIL로 변하지 않음 |
| N7 | daemon 빌드 성공 | `cd packages/daemon && npm run build` → 에러 0 |

### Baseline note (DoD 외 참고)
- **relay tsc**: baseline known-red (ioredis + pg-registry 테스트 에러). 이번 Phase에서 relay `routes/auth.ts`의 `hashPassword`/`verifyPassword` export 키워드만 제거하므로, 기존 에러에 변화 없음. gate 아님.

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | A1 대상 심볼이 같은 파일 내부에서 사용 중인데 실수로 선언 자체를 삭제 | tsc 컴파일 에러로 즉시 감지 | N1~N5 tsc 체크로 커버 |
| E2 | index.ts에서 제거한 심볼이 실제로 다른 패키지에서 import 중 | tsc 컴파일 에러로 즉시 감지 | N1~N5 tsc 체크로 커버 |
| E3 | dead code 삭제 시 테스트 파일에서 import 중인 심볼 제거 | tsc 컴파일 에러로 즉시 감지 | N1~N5 tsc 체크로 커버 (tsc only) |
| E4 | protocol index.ts에서 유니온 멤버 제거 시, 유니온 부모 타입이 깨짐 | 유니온 정의는 원본 파일에 있으므로 깨지지 않음. index.ts는 re-export만 담당. | N4 protocol tsc 체크 |

## PRD 목표 ↔ DoD 매핑

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| CI dead-exports PASS 전환 | F6 | ✅ |
| dead code 삭제 | F2 | ✅ |
| index.ts가 실제 사용 공개 API만 포함 | F3, F4, F5 | ✅ |

## 설계 결정 ↔ DoD 매핑

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| A1 export 키워드 제거 | F1 | ✅ |
| A2 dead code 삭제 (4건 명시) | F2 | ✅ |
| index.ts 미사용 re-export 제거 (모노레포 소비 기준) | F3, F4, F5 | ✅ |
| manifest 제외 | F6 (≤9건 허용) | ✅ |
| barrel export 축소 = 의도적 breaking change | F3, F4, F5 + N1~N5 tsc 안전망 | ✅ |
| relay baseline known-red | Baseline note (DoD 외 참고) | ✅ |
