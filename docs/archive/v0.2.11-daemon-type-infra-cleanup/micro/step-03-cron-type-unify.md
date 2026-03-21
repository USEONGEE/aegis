# Step 03: Cron 타입 통합 (문제 2)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (cron-scheduler.ts 내 타입 변경이므로 git revert로 복원)
- **선행 조건**: 없음 (Step 01, 02와 독립)

---

## 1. 구현 내용 (design.md 기반)

- `src/cron-scheduler.ts`에 `CronBase` interface 도입 (6 공통 필드: id, sessionId, interval, prompt, chainId, accountIndex)
- `CronEntry`를 `CronBase`를 extends하여 `intervalMs`, `lastRunAt` 추가
- `CronRegistration`을 `type CronRegistration = CronBase` (type alias)로 변경
- `CronListItem`을 `CronBase`를 extends하여 `lastRunAt` 추가

## 2. 완료 조건

- [ ] `packages/daemon/src/cron-scheduler.ts`에 `export interface CronBase` 존재하고 6개 필드 (id, sessionId, interval, prompt, chainId, accountIndex) 포함
- [ ] `packages/daemon/src/cron-scheduler.ts`에 `CronEntry extends CronBase` 존재
- [ ] `CronEntry`에 추가 필드가 `intervalMs`와 `lastRunAt` 2개뿐
- [ ] `packages/daemon/src/cron-scheduler.ts`에 `type CronRegistration = CronBase` 존재
- [ ] `packages/daemon/src/cron-scheduler.ts`에 `CronListItem extends CronBase` 존재
- [ ] `CronListItem`에 추가 필드가 `lastRunAt` 1개뿐
- [ ] 기존 `CronEntry`, `CronRegistration`, `CronListItem`의 수동 필드 복제 없음 (6 공통 필드가 CronBase에만 정의)
- [ ] `npx tsc -p packages/daemon/tsconfig.json --noEmit` exit 0 (DoD N1)
- [ ] DoD: F2a, F2b, F2c, F2d 충족

## 3. 롤백 방법
- 롤백 절차: `git revert <commit>` -- CronBase 제거, 원래 3개 독립 interface 복원
- 영향 범위: `cron-scheduler.ts` 1개 파일

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── cron-scheduler.ts   # 수정 - CronBase 도입, CronEntry/CronRegistration/CronListItem 파생화
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| cron-scheduler.ts | 직접 수정 | 타입 정의 변경 |
| admin-server.ts | 간접 영향 | `CronScheduler.list()`의 반환 타입 `CronListItem[]`이 구조적으로 동일하므로 변경 불필요 |
| index.ts | 간접 영향 | `CronScheduler` 사용 코드, 구조적 타이핑으로 호환. 변경 불필요 |

### Side Effect 위험
- 위험 없음: 구조적 타이핑에 의해 기존 코드(`register()`, `list()`, `start()` 내 객체 리터럴)가 새 타입에 자동 호환. `CronRegistration`이 `CronBase`와 동일해도 type alias로 유지하므로 `register(cron: CronRegistration)` 시그니처는 변경 없음.

### 참고할 기존 패턴
- 없음 (daemon 패키지에 base interface + extends 패턴이 아직 없으므로 이 Step이 첫 도입)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| cron-scheduler.ts | CronBase 도입 + 3 타입 파생화 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| CronBase 도입 | ✅ | OK |
| CronEntry extends CronBase | ✅ | OK |
| CronRegistration = CronBase | ✅ | OK |
| CronListItem extends CronBase | ✅ | OK |
| 외부 모듈에서 Cron 타입 직접 사용? | admin-server.ts의 `cron_list` 커맨드가 `CronScheduler.list()` 반환값을 사용하지만 `CronListItem` 타입을 직접 import하지 않음. 변경 불필요. | OK -- 누락 없음 |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 04: CronScheduler 느슨화](step-04-cron-scheduler-decouple.md)
