# Step 03: manifest ValidationResult DU 분리

## 메타데이터
- **난이도**: 🟢 낮음 (독립적, 1건)
- **롤백 가능**: ✅
- **선행 조건**: Step 02 (guarded-wdk 타입 확정)
- **위반 ID**: #30 (총 1건)
- **DoD 항목**: F8, N1, N2

---

## 1. 구현 내용 (design.md 기반)

### #30 `ValidationResult.errors?` -- DU 미적용

현재 단일 interface:
```ts
export interface ValidationResult {
  valid: boolean
  errors?: string[]
}
```

discriminated union으로 분리:
```ts
export interface ValidationResultValid {
  valid: true
}

export interface ValidationResultInvalid {
  valid: false
  errors: string[]
}

export type ValidationResult = ValidationResultValid | ValidationResultInvalid
```

- `validateManifest()` 반환부에서 `{ valid: true }` 또는 `{ valid: false, errors: [...] }` 형태로 반환
- 호출부에서 `result.valid` 체크 후 `result.errors` 접근 가능 (TypeScript narrowing)

## 2. 완료 조건
- [ ] `packages/manifest/src/types.ts`에서 `ValidationResult`가 `ValidationResultValid | ValidationResultInvalid` DU
- [ ] `ValidationResult` 관련 `?:` 0건
- [ ] `validateManifest()` 반환부가 DU variant와 일치
- [ ] manifest 패키지 `tsc --noEmit` 통과
- [ ] manifest 테스트 통과 (`manifest/tests/manifest-to-policy.test.ts`)
- [ ] `ValidationResultValid`, `ValidationResultInvalid` 타입 export 확인

## 3. 롤백 방법
- git revert 해당 커밋

---

## Scope

### 수정 대상 파일
```
packages/manifest/
├── src/types.ts                       # #30: ValidationResult DU 분리
├── src/manifest-to-policy.ts          # validateManifest() 반환부 수정 (있을 경우)
└── tests/manifest-to-policy.test.ts   # ValidationResult assertion 수정
```

### 의존성 분석

**upstream**: 없음 (manifest는 guarded-wdk에 의존하지만, `ValidationResult`는 manifest 내부 타입)

**downstream**:
- `ValidationResult`를 import하는 외부 패키지 -- daemon에서 manifest 타입을 직접 참조할 수 있으나, `ValidationResult`는 주로 manifest 내부에서 사용
- cascade 영향 미미

### Side Effect 위험
- `ValidationResult` DU 분리는 narrowing을 강화하므로, 기존에 `result.errors`를 guard 없이 접근하던 코드가 있으면 tsc 에러 발생 -- 수정 용이
- manifest는 독립적 패키지이므로 위험도 낮음

## FP/FN 검증
design.md 분석 기반, 추가 FP/FN 없음.

---

-> 다음: [Step 04: daemon 내부 타입 + deps](step-04-daemon.md)
