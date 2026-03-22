# 도메인 모델 Null 제거 - v0.4.9

## 문제 정의

### 현상

프로젝트의 "No Optional" 원칙(CLAUDE.md 설계 원칙 4)에도 불구하고, 도메인 모델 타입에 `| null`이 약 43건(guarded-wdk ~20, daemon ~10, relay ~5, app ~5, protocol 등 ~3) 존재한다. 이 null들은 시스템 경계(DB, 외부 API)가 아니라 **도메인 의미를 표현하는 데 사용**되고 있다.

패키지별 `| null` 전수 조사 결과 (전체 240건):

| 패키지 | 전체 | DB/조회/런타임 | 도메인 모델 |
|--------|------|---------------|-------------|
| guarded-wdk | 84 | ~64 | ~20 |
| daemon | 53 | ~43 | ~10 |
| relay | 50 | ~45 | ~5 |
| app | 40 | ~35 | ~5 |
| protocol+manifest+canonical | 13 | ~10 | ~3 |
| **합계** | **240** | **~197** | **~43** |

> 240건 중 ~197건은 DB nullable column, 조회 결과 없음, 런타임 상태(초기화 전), JSON primitive 등으로 **정당한 null 사용**이다. 이번 Phase의 대상은 도메인 모델 ~38건이다 (Relay Envelope ~5건은 별도 후속 Phase).

### 대상 판정 기준

**In-scope** = 비즈니스 의미를 담는 exported domain/protocol/store 타입의 `| null`. null이 "없음"이 아닌 다른 도메인 개념(전체, 미서명, 해당없음 등)을 표현하거나, DU로 자연스럽게 분리 가능한 경우.

**Out-of-scope** = 다음 중 하나에 해당:
- DB nullable column에 대응하는 Row/Record 타입의 null
- 조회 결과 부재 (`Promise<T | null>`)
- 런타임 초기화 전 상태 (`private _ws: WebSocket | null`)
- 외부 API 스펙 제약 (`content: string | null` — OpenAI)
- `useState<T | null>` 등 UI 프레임워크 패턴
- JSON primitive (`string | number | boolean | null`) 등 transport/DTO 레벨

### 주요 위반 패턴

**1. null의 의미가 도메인 개념인 경우**

```typescript
// chainId: null = "전체 체인" — 이건 별도 개념이지 "없음"이 아님
chainId: number | null  // 5개 패키지에 걸쳐 반복

// walletName: null = "이름 없음" — 이미 fallback으로 기본값 생성 중
walletName: string | null

// signedApproval: null = "아직 서명 전" — 상태 구분이지 "없음"이 아님
signedApproval: SignedApproval | null
```

**2. DU가 자연스러운데 null로 퉁친 경우**

```typescript
// targetPublicKey: device_revoke만 사용. 다른 type에선 의미 없음
targetPublicKey: string | null

// context: rejection에만 있고 success에는 없음
context: EvaluationContext | null

// matchedPermission: 매칭 여부가 boolean이 아니라 Rule 존재 여부로 표현
matchedPermission: Rule | null
```

**3. Dead 필드 또는 단일 caller null**

```typescript
// 항상 null — dead 필드
currentPolicyVersion: number | null

// null = "해시 검증 skip" — 도메인 의미이므로 DU 전환 대상
expectedTargetHash: string | null
```

### 원인

1. 초기 개발 시 빠른 구현을 위해 `| null`을 사용
2. v0.4.0 "No Optional" 원칙이 `?:` (optional property)에만 적용되고, `| null`은 체계적으로 점검하지 않음
3. `chainId: number | null` 같은 패턴이 한 패키지에서 시작해 다른 패키지로 전파

### 영향

- **원칙 위반**: "No Optional" 원칙이 `| null`에 대해서는 미적용 상태
- **의미 모호**: `null`이 "없음", "전체", "초기화 전", "해당 없음" 등 여러 의미로 사용됨. 코드를 읽는 사람이 null의 의미를 추론해야 함
- **Dead 코드**: `currentPolicyVersion`은 항상 null (dead field). `expectedTargetHash`는 "검증 skip" 의미로 null 사용 중 (DU 전환 대상)
- **확산 위험**: 기존 패턴을 참고해 새 코드에서도 `| null` 사용이 계속됨

### 목표

이 Phase가 완료되면:

1. **도메인 모델에서 `| null` 제거**: 총 발견 ~43건 중 ~38건(Relay Envelope ~5건 제외)을 DU, 기본값, 또는 삭제로 해소
2. **Dead 필드 삭제**: `currentPolicyVersion` 삭제 + `expectedTargetHash` DU 전환
3. **패턴 확립**: `chainId` 같은 "전체/단일" 의미는 DU로, `walletName` 같은 "이름 없음"은 기본값으로 — 각 패턴의 해결 방식이 일관됨

### 비목표 (Out of Scope)

- DB nullable column의 null 제거 — DB 스키마 변경은 별도 작업. 완전 제외
- 조회 결과 `Promise<T | null>` 변경 — "찾지 못함"은 정당한 null 사용. 완전 제외
- 런타임 상태 null (`_ws: WebSocket | null`, `useState<T | null>`) — 구현 레벨. 완전 제외
- 외부 API 제약 null (`content: string | null` — OpenAI API) — 완전 제외
- 콜백 `| null` (`onDelta: ((d: string) => void) | null`) — 완전 제외
- CI 체크 추가 (null 재도입 방지 린트) — 완전 제외. 별도 Phase로

## 제약사항

- **v0.4.8 선행**: v0.4.8(WS 채널 재설계 + Protocol 타입 강제)이 protocol/relay/daemon 타입을 대폭 변경함. v0.4.8 완료 후 착수해야 충돌 없음
- **Breaking change 허용**: 프로젝트 원칙에 따라 호환성보다 정확성 우선
- **동시 배포 전제**: app/relay/daemon 한 번에 배포
- DU 전환 시 switch exhaustiveness check가 컴파일 타임에 보장되어야 함 (`never` 패턴)

## 선행 Phase

| Phase | 상태 | 영향 |
|-------|------|------|
| v0.4.0 No Optional 원칙 전면 적용 | 완료 | `?:` optional property 제거 완료. `| null`은 미처리 |
| v0.4.8 WS 채널 재설계 + Protocol 타입 강제 | Step 1 | protocol 타입 확정 후 착수. 직접 선행 |
