# 작업위임서 — Daemon Dead Code 정리 + Dead Exports CI 체크 포팅

> daemon 아키텍처 분석 중 발견된 3건의 dead code 정리 + HypurrQuant의 dead-exports 체크를 WDK-APP에 포팅

---

## 6하원칙

### Who (누가)
- 다음 세션 / 어떤 agent든
- 필요 권한: daemon 패키지 + scripts/check/ 수정

### What (무엇을)

**Part A — Dead Code 정리 (3건)**

- [ ] **PairingSession 제거** — `const pairingSession = null` (const이므로 재할당 불가, 항상 null). `pairing_confirm` 핸들러가 항상 실패. v0.3.0에서 enrollment code 방식으로 이미 대체됨
- [ ] **handleChatMessage의 optional queueManager 제거** — `queueManager?: MessageQueueManager | null`을 필수 파라미터로 변경. `else` 분기(direct processing) 삭제. 호출처는 항상 전달 중
- [ ] **`_processChatDirect` handleChatMessage 내 직접 호출 삭제** — 위 변경의 후속. `_processChatDirect` export 자체는 유지 (index.ts:78의 queue processor 콜백에서 사용 중)

**Part B — Dead Exports CI 체크 포팅**

- [ ] HypurrQuant의 `scripts/check/checks/cross/dead-exports.ts`를 WDK-APP 체크 프레임워크에 맞게 포팅
- [ ] ts-morph를 devDependency에 추가
- [ ] registry.ts에 등록
- [ ] 실행 확인 + Part A의 dead code가 감지되는지 검증

### When (언제)
- 즉시 가능 (선행 조건 없음)
- Part B는 Part A와 독립. 병렬 가능. 단, Part B 먼저 하면 Part A의 dead code를 CI가 잡아주므로 B→A 순서 추천
- 기한 없음

### Where (어디서)

**Part A — 변경 대상 파일:**

| 파일 | 라인 | 변경 |
|------|------|------|
| `packages/daemon/src/index.ts` | :65 | `const pairingSession` 선언 제거 |
| `packages/daemon/src/index.ts` | :96 | `handleControlMessage` 호출에서 `pairingSession` 인자 제거 |
| `packages/daemon/src/control-handler.ts` | :14-20 | `PairingSession` interface 제거 |
| `packages/daemon/src/control-handler.ts` | :58-65 | `handleControlMessage` 시그니처에서 `pairingSession` 파라미터 제거 |
| `packages/daemon/src/control-handler.ts` | :226-298 | `pairing_confirm` case 전체 제거 |
| `packages/daemon/src/chat-handler.ts` | :24-63 | `queueManager`를 필수로, else 분기 삭제 |

**Part B — 포팅 원본 + 대상:**

| 원본 | 대상 |
|------|------|
| `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/checks/cross/dead-exports.ts` | `scripts/check/checks/cross/dead-exports.ts` (새 파일) |
| `scripts/check/registry.ts` | 체크 등록 추가 |
| `package.json` | ts-morph devDependency 추가 |

### Why (왜)

**Part A:**
- **No Fallback 원칙 위반**: handleChatMessage의 else 분기는 절대 실행되지 않는 fallback
- **No Optional 원칙 위반**: `queueManager?`는 항상 전달되므로 optional일 이유 없음
- **Dead code**: PairingSession은 const null로 기능 불가. enrollment code로 이미 대체됨
- 안 하면: 코드를 읽는 사람이 "queueManager가 없는 경우는?"이라는 불필요한 질문을 하게 됨

**Part B:**
- 현재 `dead-files` 체크는 파일 단위만 탐지. 파일 내부의 미사용 export는 잡지 못함
- HypurrQuant에 이미 검증된 dead-exports 체크가 있으므로 재활용

### How (어떻게)

**Part A — 직접 구현** (phase workflow 불필요한 규모)

**Part B — 포팅 시 변경점:**

| HypurrQuant 전용 | WDK-APP 대응 |
|-------------------|--------------|
| `CheckModule` / `CheckContext` / `buildResult` / `measure` | WDK-APP의 `CheckResult` / `CheckFn` (단순 인터페이스) |
| `ctx.getProject(tsconfig)` | ts-morph `new Project({ tsConfigFilePath })` 직접 생성 |
| `APPS_WEB`, `APPS_SERVER`, `PACKAGES_CORE`, `PACKAGES_REACT` | `packages/guarded-wdk`, `daemon`, `relay`, `manifest`, `app`, `canonical` |
| `shouldExcludeFile()`, `hasCiException()` | 불필요 — 제거하거나 단순화 |
| Next.js convention file 면제 (`page.tsx`, `layout.tsx` 등) | **삭제** — WDK-APP에 Next.js 없음 |
| `toRelative()` import from check-scope | WDK-APP utils의 경로를 `MONOREPO_ROOT` 기준 relative로 변환 |

핵심 알고리즘 (4단계)은 **그대로** 사용:
1. 모든 first-party 소스 파일 수집
2. `getExportedDeclarations()`로 export 수집 → canonical origin 해소
3. `ImportDeclaration` 스캔 → `resolveCanonicalOrigin()`으로 소비자 마킹
4. 마킹되지 않은 export = dead export

---

## 맥락

### 현재 상태
- 발견 경위: daemon 아키텍처 분석(arch-one-pager, 도메인 Aggregate 분류) 중 발견
- 분석 리포트: `docs/report/daemon-domain-aggregate-analysis.md`

### 사용자 확정 결정사항
- PairingSession은 제거한다 (enrollment code로 대체 확인됨)
- handleChatMessage의 fallback은 No Fallback 원칙 위반으로 제거한다
- dead-exports CI 체크는 HypurrQuant에서 포팅한다 (새로 만들지 않음)

### 같은 세션에서 수행한 작업 (참고용)
| 작업 | 산출물 |
|------|--------|
| arch-one-pager 스킬 업데이트 | `.claude/skills/arch-one-pager/SKILL.md` — 6섹션 구조 (도메인 Aggregate + 참조 그래프) |
| domain-aggregates.md 신규 | `.claude/skills/arch-one-pager/domain-aggregates.md` — 타입 역할 분류 (core/input/output/enum/value/config/port) |
| daemon 아키텍처 리포트 | `docs/report/daemon-domain-aggregate-analysis.md` — 5개 도메인 + 3축 + 3시나리오 |

### 참조 문서
| 문서 | 경로 | 용도 |
|------|------|------|
| Daemon 도메인 분석 | `docs/report/daemon-domain-aggregate-analysis.md` | dead code 발견 맥락 |
| HypurrQuant dead-exports 원본 | `/Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/checks/cross/dead-exports.ts` | 포팅 원본 (346줄) |
| WDK-APP CI 체크 가이드 | `.claude/skills/wdk-ci-check/SKILL.md` | 체크 프레임워크 구조 |
| WDK-APP 체크 레지스트리 | `scripts/check/registry.ts` | 체크 등록 위치 |
| WDK-APP 체크 타입 | `scripts/check/types.ts` | CheckResult/CheckFn 인터페이스 |

---

## 주의사항
- `pairing_confirm` 제거 시 `@wdk-app/protocol`의 `ControlMessage` 타입에서도 해당 variant 확인 필요
- `_processChatDirect`는 `index.ts:78`의 queue processor 콜백에서 사용 중 → handleChatMessage 내부 호출만 제거, export는 유지
- Part B 포팅 시 `resolveCanonicalOrigin` 함수가 핵심. barrel re-export 체인을 따라가는 로직이므로 수정하지 말 것
- WDK-APP의 `protocol` 패키지는 아직 tsconfig이 없을 수 있음 — dead-exports 스캔 대상에서 제외하거나 tsconfig 추가 필요

## 시작 방법

```bash
# Part A: dead code 범위 확인
grep -rn "pairing" packages/daemon/src/ packages/daemon/tests/
grep -rn "queueManager?" packages/daemon/src/

# Part A: 변경 후 검증
cd packages/daemon && npx jest
npx tsx scripts/check/index.ts

# Part B: 포팅 시작
cat /Users/mousebook/Documents/side-project/HypurrQuant_FE/scripts/check/checks/cross/dead-exports.ts
# → WDK-APP 프레임워크에 맞게 수정 후 scripts/check/checks/cross/dead-exports.ts에 저장
npx tsx scripts/check/index.ts --check=cross/dead-exports
```
