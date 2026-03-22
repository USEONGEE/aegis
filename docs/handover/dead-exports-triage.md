# 작업위임서 — Dead Exports 전체 분류 + 원인 분석

> 126건 dead export를 "진짜 dead" vs "타입이 unknown이라 안 쓰이는 것" vs "패키지 공개 API"로 분류

---

## 6하원칙

### Who (누가)
- 다음 세션
- 필요 접근: 전체 모노레포 파일 시스템, CI 체크 (`scripts/check/`)

### What (무엇을)
- [ ] `npx tsx scripts/check/index.ts --check=dead-exports` 실행하여 126건 목록 확보
- [ ] 각 dead export를 아래 3개 카테고리로 분류:
  - **A. 진짜 dead** — 내부에서도 외부에서도 안 쓰임. export 키워드 제거 또는 삭제 대상
  - **B. 타입 gap** — 런타임에서는 사용되지만, 소비자가 `unknown`/`any`로 받아서 타입을 import하지 않는 것. export 유지하되 소비자 쪽 타입 좁히기 필요
  - **C. 패키지 공개 API** — index.ts에서 re-export하는 공개 타입. 외부 소비자가 아직 없지만 SDK 계약상 유지
- [ ] 카테고리별 건수와 대표 사례를 정리한 리포트 생성 (`docs/report/dead-exports-triage.md`)
- [ ] B 카테고리에서 타입 좁히기가 필요한 항목 목록 → 후속 Phase 후보로 정리

### When (언제)
- 즉시 가능 (선행 조건 없음)
- 기한 없음

### Where (어디서)
- CI 체크: `scripts/check/checks/cross/dead-exports.ts`
- 대상: 전체 `packages/` (guarded-wdk, canonical, daemon, relay, manifest, app, protocol)
- 리포트 출력: `docs/report/dead-exports-triage.md`

### Why (왜)
- dead-exports 체크가 126건 FAIL 상태 — CI 신뢰도 저하
- 단순히 전부 export 제거하면 안 됨: 일부는 **런타임에서 사용 중이나 타입만 dead**인 경우가 있음
- 예시 발견:
  - `FailedArg`, `RuleFailure` (guarded-wdk) — `evaluatePolicy()`가 런타임에서 생성하여 `PolicyRejectionError.context`에 담지만, context가 `unknown` 타입이라 소비자가 import하지 않음
  - 이런 "타입 gap" 항목을 식별하지 않으면, export 제거 시 나중에 타입 좁히기가 불가능해짐

### How (어떻게)
- 분류 기준:

```
각 dead export에 대해:
1. Grep으로 해당 심볼의 런타임 사용 확인 (new, 함수 호출, 값 생성)
2. 런타임 사용 있음 → 소비자가 unknown/any로 받는지 확인 → B (타입 gap)
3. 런타임 사용 없음 + index.ts re-export → C (공개 API)
4. 런타임 사용 없음 + index.ts에도 없음 → A (진짜 dead)
```

- 리포트는 `/report-generator` 스킬로 `docs/report/`에 생성
- 후속 조치가 필요한 B 카테고리는 Phase 후보로 문서화

---

## 맥락

### 현재 상태
- CI: 18 checks, 16 PASS / 2 FAIL (`dead-exports` 126건, `no-public-verifier-export` 1건)
- dead-exports 126건 패키지별 분포: guarded-wdk, canonical, daemon, relay, manifest, app 전체에 걸쳐 분포

### 발견된 B 카테고리 예시

| 심볼 | 패키지 | 상황 |
|------|--------|------|
| `FailedArg` | guarded-wdk | `matchArgs()`가 런타임 생성 → `EvaluationContext.ruleFailures`에 담김 → `PolicyRejectionError.context: unknown`으로 전달 |
| `RuleFailure` | guarded-wdk | 동일. `evaluatePolicy()`에서 수집 → context에 포함 |

이 패턴이 다른 패키지에서도 반복되는지가 핵심 분석 포인트.

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| guarded-wdk 아키텍처 | `docs/report/guarded-wdk-architecture-one-pager.md` | Policy 도메인 타입 구조 |
| dead-exports 체크 | `scripts/check/checks/cross/dead-exports.ts` | CI 체크 구현 |

---

## 주의사항
- A로 분류된 export도 삭제 전에 테스트 실행 필수
- B로 분류된 항목의 export를 제거하면, 나중에 `unknown` → 구체 타입 좁히기 시 다시 export해야 함
- C는 현재 삭제하지 않되, 실제 외부 SDK 사용 계획이 없으면 장기적으로 검토

## 시작 방법
```bash
npx tsx scripts/check/index.ts --check=dead-exports 2>&1 | head -150
```
출력된 126건을 순회하며 분류 시작.
