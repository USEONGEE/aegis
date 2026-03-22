# 설계 - v0.4.7

## 변경 규모
**규모**: 일반 기능
**근거**: 6개 패키지(guarded-wdk, daemon, relay, app, protocol, canonical)에 걸친 export 수정. 단, 런타임 동작 변경 없음(타입/export 수준).

---

## 문제 요약
CI `cross/dead-exports` 132건 FAIL. 원인은 습관적 over-export(A1, 31건), dead code(A2, 4건), index.ts 미사용 re-export(~50건). manifest 9건은 의도적 유지.

> 상세: [README.md](README.md) 참조

## 접근법

3단계 순차 정리:

1. **A1: `export` 키워드 제거 (31건)** — 같은 파일 내부에서 사용 중인 심볼에서 `export` 키워드만 삭제
2. **A2: dead code 삭제 (4건)** — 완전 미사용 심볼/파일 삭제
3. **index.ts 미사용 re-export 제거 (~50건)** — 모노레포 내 다른 패키지가 import하지 않는 심볼을 index.ts에서 제거. 원본 파일의 export는 유지(A1에서 이미 처리되지 않은 것).

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: 직접 정리 (export 제거 + index.ts 정리) | CI 체크 수정 불필요, 근본 해결 | 파일 수 많음 (기계적) | ✅ |
| B: CI severity 분리 (index.ts = warn) | 코드 수정 없음 | FN 발생 (미사용 re-export가 숨음), 근본 미해결 | ❌ |
| C: `@public-api` 허용 목록 | 의도적 export 명시 가능 | 관리 오버헤드, 체크 로직 수정 필요 | ❌ |

**선택 이유**: A가 유일한 근본 해결. B/C는 "알려진 violations을 숨기는" 접근으로, 신규 dead export 감지를 방해.

## 기술 결정

1. **`export` 제거는 기계적**: 각 심볼이 같은 파일 내부에서 사용되는지 사전 확인 완료 (triage 분석). `export` 키워드만 삭제하면 내부 사용에 영향 없음.
2. **dead code 삭제 범위**:
   - `switchSeed` (daemon/wdk-host.ts) — 함수만 삭제
   - `UnsignedIntent` (app/core/approval/types.ts) — 인터페이스만 삭제
   - `E2ECrypto` (app/core/crypto/E2ECrypto.ts) — 파일 전체 삭제 (v0.3.4 pairing 제거 후 고아)
   - `TxApprovalStatus` (app/shared/tx/TxApprovalContext.tsx) — 타입 별칭만 삭제
3. **index.ts 정리 기준**: CI dead-exports 체크와 동일 기준 — 모노레포 내 어디에서도 import되지 않으면 제거
4. **manifest 제외**: 외부 SDK용이므로 소비자 부재가 정상. index.ts 수정 없음.
5. **테스트 import 확인**: 일부 심볼은 테스트에서만 import됨. 테스트 import가 있으면 dead export가 아님(CI 체크가 이미 반영).

---

## 범위 / 비범위

**범위(In Scope)**:
- guarded-wdk: 5건 export 제거 + index.ts ~14건 re-export 제거
- daemon: 16건 export 제거 + 1건 dead code 삭제 (`switchSeed`)
- relay: 2건 export 제거
- app: 14건 export 제거 + 3건 dead code 삭제 (`UnsignedIntent`, `E2ECrypto` 파일, `TxApprovalStatus`)
- protocol: index.ts ~33건 re-export 제거
- canonical: index.ts 3건 re-export 제거

**비범위(Out of Scope)**:
- manifest 패키지 (9건 유지)
- B 카테고리 (같은 패키지 내 구조적 매칭)
- CI 체크 로직 수정
- `no-public-verifier-export` 1건

## API/인터페이스 계약

**이번 Phase는 barrel public surface를 의도적으로 축소하는 breaking change.**

모노레포 내 실제 소비자 기준으로 index.ts를 정리하므로, 외부에서 이 패키지를 import하는 코드가 있다면 깨질 수 있음. 단, 현재 외부 소비자 없음 (npm 미publish, monorepo 전용). CLAUDE.md "Breaking change 적극 허용" 원칙에 따름.

| 패키지 | 변경 전 export | 변경 후 export (추정) | 축소분 |
|--------|--------------|---------------------|--------|
| guarded-wdk | ~36 | ~20 | ~16 |
| protocol | ~44 | ~11 | ~33 |
| canonical | 8 | 5 | 3 |

제거되는 심볼은 원본 파일에서 `export`가 유지되므로(A1 처리 대상 제외), 나중에 소비자가 생기면 index.ts에 다시 추가 가능.

## 아키텍처 개요

변경 없음. 패키지 간 의존 방향, 런타임 동작 모두 그대로. 변경은 순수하게 "사용되지 않는 export 선언" 제거.

```
변경 전: guarded-wdk index.ts exports 34개 → 변경 후: ~20개 (실제 소비되는 것만)
변경 전: protocol index.ts exports 44개 → 변경 후: ~11개 (유니온 + 와이어 타입만)
변경 전: canonical index.ts exports 8개 → 변경 후: 5개 (실제 소비되는 것만)
```

## 테스트 전략

- **타입 체크** (핵심 안전망):
  - `npx tsc --noEmit -p packages/guarded-wdk/tsconfig.json`
  - `npx tsc --noEmit -p packages/daemon/tsconfig.json`
  - `npx tsc --noEmit -p packages/app/tsconfig.json`
  - `npx tsc --noEmit -p packages/protocol/tsconfig.json`
  - `npx tsc --noEmit -p packages/canonical/tsconfig.json`
  - relay는 기존 타입 에러 있음 (ioredis 관련, 이번 변경과 무관)
- **CI 체크**: `npx tsx scripts/check/index.ts` — dead-exports 건수 감소 확인 + 다른 16개 PASS 체크 퇴행 없음
- **빌드**: daemon(`npm run build`), relay(`npm run build`)만 빌드 스크립트 존재. 나머지 패키지는 tsc --noEmit이 검증 역할.
- 런타임 테스트 불필요 (타입/export 수준 변경만, 런타임 코드 무변경)

## 리스크/오픈 이슈

- **barrel export 축소가 breaking change**: 모노레포 외부 소비자가 있다면 깨짐. 현재 없으므로 리스크 낮음. manifest 제외로 외부 SDK 계약 보존.
- tsc 타입 체크가 안전망 — 실수로 사용 중인 심볼을 제거하면 즉시 컴파일 에러로 감지.

## 가정/제약

N/A: 선행 triage에서 132건 전수 분석 완료. 가정 없이 확인된 사실 기반.
