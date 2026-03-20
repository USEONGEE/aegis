# Manifest 타입 중복 제거 - v0.2.3

## 문제 정의

### 현상
- `packages/manifest`와 `packages/guarded-wdk`에 구조적으로 동일한 타입이 양쪽에 독립 정의되어 있음
  - `ManifestArgCondition` ≡ `ArgCondition` (condition + value)
  - `ManifestRule` ≡ `Rule` (order, args, valueLimit, decision)
  - `ManifestPermissionDict` ≡ `PermissionDict` (`{target: {selector: Rule[]}}`)
  - Decision 리터럴 `'AUTO' | 'REQUIRE_APPROVAL' | 'REJECT'` 양쪽에 하드코딩
- manifest의 `PolicyPermission` 타입은 어디에서도 사용되지 않음 (orphaned)
- manifest는 `args?`, `valueLimit?` 등 optional 필드를 사용하나, guarded-wdk `Rule`도 동일하게 optional 사용 중 (별도 Phase에서 정리)

### 원인
- manifest 패키지 초기 생성(v0.1.4) 이후 guarded-wdk가 v0.1.7~v0.2.1까지 대폭 리팩토링됨
- guarded-wdk 리팩토링 시 manifest와의 타입 동기화가 고려되지 않음
- manifest가 guarded-wdk를 의존하지 않아 각자 타입을 정의

### 영향
- **타입 드리프트**: guarded-wdk 타입이 변경되면 manifest는 자동으로 따라가지 않음. 향후 연동 시 런타임 불일치 발생 가능
- **이중 유지보수**: 동일 의미의 타입을 두 곳에서 관리
- **v0.1.10 Semantic Union 미반영**: guarded-wdk는 `Decision` 타입을 도입했으나 manifest는 raw string literal 사용

### 목표
- manifest가 guarded-wdk의 정책 타입(`ArgCondition`, `Rule`, `PermissionDict`, `Decision`)을 직접 참조
- manifest 내 중복 타입(`ManifestArgCondition`, `ManifestRule`, `ManifestPermissionDict`) 제거
- 미사용 타입(`PolicyPermission`) 제거
- `manifestToPolicy()` 반환 타입이 guarded-wdk의 `PermissionDict`가 되도록 통일
- guarded-wdk에서 `ArgCondition`, `Decision` public export 추가 (현재 `Rule`, `PermissionDict`만 export)

### 비목표 (Out of Scope)
- manifest의 Manifest/Feature/Call/Approval/Constraint 등 프로토콜 선언 타입 변경 (이들은 manifest 고유 도메인)
- manifestToPolicy() 로직 변경 (타입만 교체)
- `args?`, `valueLimit?` optional 필드 정리 (guarded-wdk `Rule` 자체가 optional 사용 중이므로 별도 Phase)
- v0.2.2 Policy Resolver 작업

## 제약사항
- 의존 방향: manifest → guarded-wdk (단방향). guarded-wdk는 manifest를 알지 않아야 함 ("No Two-Way Implements")
- manifest의 테스트가 통과해야 함
- guarded-wdk 변경 범위는 public type export 추가에 한정 (로직 변경 없음)
- **manifest public API breaking change**: `ManifestRule`, `ManifestArgCondition`, `ManifestPermissionDict`, `PolicyPermission` export가 제거되고 guarded-wdk 타입으로 대체됨
