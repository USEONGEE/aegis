# Manifest 정책 호환성 복원 - v0.2.8

## 문제 정의

### 현상
- **tsc 빌드 실패**: `manifest-to-policy.ts:55,77`에서 `'REQUIRE_APPROVAL'`을 `Decision` 타입에 할당하면 타입 에러 발생. manifest 소스 자체가 이미 guarded-wdk 계약을 어기고 있음
- `manifestToPolicy()`가 생성하는 기본 decision 값이 `'REQUIRE_APPROVAL'`이지만, guarded-wdk의 `Decision` 타입은 `'ALLOW' | 'REJECT'`만 허용
- 테스트에서 `'AUTO'` decision을 사용하지만, 이 역시 guarded-wdk에서 유효하지 않은 값
- guarded-wdk의 `validatePolicy()`가 `['ALLOW', 'REJECT']`만 통과시키므로, manifest가 생성한 정책은 런타임에서도 즉시 거부됨
- `Feature.constraints[]`가 manifest 스키마의 필수 필드이고 validator/example까지 물고 있지만, `manifestToPolicy()` 변환 시 완전히 무시됨
- `UserConfig.tokenAddresses`와 `UserConfig.userAddress`가 destructure만 되고 실제 사용되지 않음

### 원인
- v0.2.5에서 guarded-wdk의 Decision을 `'ALLOW' | 'REJECT'`로 단순화했으나, manifest 패키지가 이 변경에 동기화되지 않음
- manifest 패키지가 이전 Decision 체계(`REQUIRE_APPROVAL`, `AUTO`, `REJECT`)를 전제로 작성됨
- constraints, tokenAddresses, userAddress는 초기 설계 시 placeholder로 남겨둔 채 구현되지 않음

### 영향
- **빌드 파손**: `npx tsc -p packages/manifest/tsconfig.json --noEmit` 실패. manifest 패키지 자체가 타입 체크를 통과하지 못함
- **런타임 에러**: 빌드를 우회하더라도, manifest로 생성한 정책을 guarded-wdk에 로드하면 `validatePolicy()`에서 `Invalid decision` 에러 발생
- **패키지 간 계약 위반**: manifest가 guarded-wdk의 타입을 import하면서도 실제로는 호환되지 않는 값을 생성
- **테스트 허위 통과**: manifest 단독 테스트는 통과하지만, guarded-wdk `validatePolicy()` 경로를 타지 않아 허위 양성
- **미사용 코드**: constraints, tokenAddresses, userAddress 관련 코드가 타입/validator/example/test에 걸쳐 dead code로 존재

### 목표
1. **tsc 빌드 복원**: `npx tsc -p packages/manifest/tsconfig.json --noEmit` 통과
2. manifest가 생성하는 모든 Decision 값이 guarded-wdk의 `'ALLOW' | 'REJECT'`와 완전히 호환
3. `manifestToPolicy()` 출력물이 guarded-wdk `validatePolicy()`를 통과
4. 미사용 placeholder를 public API에서 완전 제거 — `Feature.constraints`, `UserConfig.tokenAddresses`, `UserConfig.userAddress` 필드 삭제 + validator/example/test에서 관련 코드 제거 (Breaking change 허용 원칙 적용)
5. manifest 테스트에 guarded-wdk `validatePolicies()` 연동 검증 추가 — 허위 양성 방지

### 비목표 (Out of Scope)
- constraints를 실제 Rule로 변환하는 기능 구현 (별도 Phase)
- tokenAddresses 기반 토큰 주소 resolve 기능 구현 (별도 Phase)
- 새로운 DeFi 프로토콜 manifest 추가
- manifest JSON 스키마 외부 배포
- guarded-wdk의 Decision 타입 변경

## 제약사항
- guarded-wdk의 `Decision = 'ALLOW' | 'REJECT'`는 확정이며 변경 불가
- manifest의 `UserConfig.decision` 필드 타입은 guarded-wdk에서 import하므로 자동으로 제한됨
- 프로젝트 설계 원칙 "No Optional" 준수: 선택적 필드 대신 별도 타입 분리
- 프로젝트 설계 원칙 "No Backward Compatibility": 이전 값(`REQUIRE_APPROVAL`, `AUTO`)에 대한 호환 shim 불필요
