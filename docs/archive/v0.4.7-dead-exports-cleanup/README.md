# Dead Exports 정리 - v0.4.7

## 문제 정의

### 현상
- CI `cross/dead-exports` 체크가 132건 violation으로 FAIL
- 18개 CI 체크 중 16 PASS / 2 FAIL 상태 (`dead-exports` 132건, `no-public-verifier-export` 1건)

**수치 변천**: triage 시점 126건 → v0.4.5(+5 wire 타입) → v0.4.6(store 리네임, +1) → 현재 132건. 본 PRD는 v0.4.6 적용 후 132건 기준.

### 원인
3가지 원인이 복합:

1. **습관적 over-export (A1, 31건)**: 같은 파일 내부에서만 사용하는 타입/함수에 불필요하게 `export` 키워드를 붙임. 유니온 멤버 타입, 파라미터 타입, 반환 타입이 대부분.

2. **dead code (A2, 4건)**: 더 이상 사용되지 않는 심볼이 코드에 남아 있음.
   - `switchSeed` (daemon) — `initWDK()` trivial wrapper, 호출처 없음
   - `UnsignedIntent` (app) — v0.1.0 설계 시 정의만 하고 미구현
   - `E2ECrypto` (app) — v0.3.4 pairing 제거 후 고아 클래스. 파일 전체 dead
   - `TxApprovalStatus` (app) — DU `TxApprovalState`로 대체됨

3. **index.ts 미사용 re-export (~50건)**: 모노레포 내 다른 패키지가 import하지 않는 심볼을 index.ts에서 re-export. triage report에서는 이를 C(공개 API)로 분류하여 "유지"로 판단했으나, 이후 분석에서 모노레포 내 실제 소비자가 없으면 공개 API로 유지할 근거가 없다고 판단. 본 Phase에서 정리 대상으로 전환.
   - guarded-wdk: ~14건 (에러 클래스, 유틸, 대안 구현 — 다른 패키지가 import하지 않음)
   - protocol: ~33건 (유니온 멤버 전량 — 소비자는 부모 유니온만 import, TS narrowing으로 충분)
   - canonical: 3건 (파라미터/반환 타입 — 구조적 추론으로 충분)

**참고**: manifest 패키지 9건은 외부 정책 작성자용 SDK로 소비자 패키지가 아직 없을 뿐이므로 제외. triage의 C 분류 중 manifest만 유지.

### 영향
- CI 신뢰도 저하: `dead-exports` 체크가 항상 FAIL이므로 새로 추가되는 dead export를 감지할 수 없음
- 코드 위생: dead code 4건이 코드베이스에 잔존
- API 경계 불명확: index.ts가 "실제 공개 API"와 "습관적 export"를 구분하지 못함

### 목표
- CI `cross/dead-exports` 체크를 PASS로 전환 (manifest 9건 제외 시 0건, 또는 manifest 포함 9건 이하)
- dead code 삭제로 코드베이스 정리
- 각 패키지의 index.ts가 실제 사용되는 공개 API만 포함

### 비목표 (Out of Scope)
- manifest 패키지 정리 (소비자가 없는 것은 정상 — 외부 SDK)
- B 카테고리 (같은 패키지 내 구조적 매칭) 해소 — v0.4.5에서 크로스 패키지 부분은 해소됨
- CI 체크 로직 수정 (severity 분리 등) — index.ts 정리로 충분
- `no-public-verifier-export` 1건 — 별도 이슈, 이 Phase 범위 밖

## 제약사항
- Breaking change 허용 (CLAUDE.md 원칙)
- `export` 제거 시 같은 파일 내부 사용에 영향 없어야 함
- dead code 삭제 시 테스트에서 import하는 경우 확인 필요
- manifest 패키지는 건드리지 않음

## 선행 분석
- [docs/report/dead-exports-triage.md](../../report/dead-exports-triage.md) — triage 126건 분류 + 크로스 패키지 unknown 분석. 132건 증분은 v0.4.5 반영분
- v0.4.5 unknown 타입 체인 해소 (커밋 대기) — 이 Phase의 132건 기준은 v0.4.5 적용 후 수치
