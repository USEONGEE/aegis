# Step 01: dead-exports.ts 핵심 구현

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (신규 파일 삭제)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `scripts/check/checks/cross/dead-exports.ts` 신규 생성
- HypurrQuant 원본에서 4단계 알고리즘 포팅:
  1. `SCAN_TARGETS` (7개 패키지 tsconfig) + `SRC_PREFIXES` (각 패키지 `src/`) 정의
  2. `isFirstPartyCode()` — SRC_PREFIXES 기반 필터
  3. `resolveCanonicalOrigin()` — barrel chain 해소 (원본 유지)
  4. `deadExportsCheck()` — CheckFn 구현
     - Phase 1: 소스 파일 수집 (universe Map dedup)
     - Phase 2: export 수집 + alias 매핑
     - Phase 3: import 소비자 마킹 (named, default, namespace, type)
     - Phase 4: dead export 계산 → violations
- HypurrQuant 전용 코드 제거: Next.js 면제, shouldExcludeFile, hasCiException, buildResult, measure
- WDK-APP 프레임워크 적응: getProject() from ts-project.ts, MONOREPO_ROOT from utils.ts

## 2. 완료 조건
- [ ] `scripts/check/checks/cross/dead-exports.ts` 파일이 존재한다
- [ ] 함수가 `CheckResult | Promise<CheckResult>`를 반환한다 (DoD F1)
- [ ] `SCAN_TARGETS`가 7개 패키지 tsconfig를 포함한다 (DoD F7)
- [ ] `SRC_PREFIXES`가 `SCAN_TARGETS`에서 파생된 `src/` 경로다
- [ ] `isFirstPartyCode()`가 `SRC_PREFIXES.some()` 패턴을 사용한다 (DoD E1)
- [ ] `resolveCanonicalOrigin()`이 HypurrQuant 원본과 동일한 로직이다
- [ ] universe가 `Map<string, SourceFile>`로 dedup된다 (DoD E2)
- [ ] namespace import 처리 분기(`getNamespaceImport()`)가 존재한다 (DoD E3)
- [ ] HypurrQuant 전용 helper가 제거되었다: `shouldExcludeFile()`, `hasCiException()`, `buildResult()`, `measure()` 미사용
- [ ] `toRelative()`가 `path.relative(MONOREPO_ROOT, filepath)` 방식으로 대체되었다
- [ ] `CheckResult`를 직접 반환한다 (`buildResult` wrapper 없음)

## 3. 롤백 방법
- `rm scripts/check/checks/cross/dead-exports.ts`

---

## Scope

### 신규 생성 파일
```
scripts/check/checks/cross/
└── dead-exports.ts  # 신규 — dead exports 탐지 체크
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `shared/ts-project.ts` | import | `getProject()` 캐시 유틸 사용 |
| `shared/utils.ts` | import | `MONOREPO_ROOT` 상수 사용 |
| `types.ts` | import | `CheckResult`, `Violation` 타입 사용 |

### Side Effect 위험
- 없음 (신규 파일 생성만)

### 참고할 기존 패턴
- `scripts/check/checks/cross/dead-files.ts`: 같은 cross 그룹의 파일 레벨 체크
- HypurrQuant 원본: `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/checks/cross/dead-exports.ts`

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| dead-exports.ts (신규) | 전체 구현 대상 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| SCAN_TARGETS 정의 | dead-exports.ts 내부 | ✅ OK |
| isFirstPartyCode | dead-exports.ts 내부 | ✅ OK |
| resolveCanonicalOrigin | dead-exports.ts 내부 | ✅ OK |
| 4단계 알고리즘 | dead-exports.ts 내부 | ✅ OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: registry 등록 + 통합 검증](step-02-registry-verify.md)
