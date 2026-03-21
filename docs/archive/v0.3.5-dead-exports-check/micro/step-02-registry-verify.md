# Step 02: registry 등록 + 통합 검증

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (registry.ts에서 엔트리 제거)
- **선행 조건**: Step 01 완료

---

## 1. 구현 내용 (design.md 기반)
- `scripts/check/registry.ts`에 `cross/dead-exports` 체크 등록
- 통합 실행 검증: 전체 체크 + 단독 실행

## 2. 완료 조건
- [ ] `registry.ts`에 `name: 'cross/dead-exports'`, `group: 'cross'` 엔트리가 존재한다 (DoD F2)
- [ ] `npx tsx scripts/check/index.ts --check=cross/dead-exports` 실행 시 정상 종료 + violations 출력 (DoD F3)
- [ ] `ToolResult` deprecated alias가 violations에 포함된다 (DoD F4)
- [ ] `SqliteApprovalStore`가 violations에 **없다** (barrel re-export consumed — DoD F5)
- [ ] `RelayEnvelope`가 violations에 **없다** (import type consumed — DoD F6)
- [ ] `npx tsx scripts/check/index.ts` 전체 실행 시 기존 체크가 exception 없이 완료된다 (DoD N1)
- [ ] `shared/utils.ts`의 `PACKAGES` 상수가 변경되지 않았다 (DoD N2)
- [ ] violations에 `App.tsx`가 없다 (DoD E1)

## 3. 롤백 방법
- `registry.ts`에서 `cross/dead-exports` 엔트리 제거
- `git checkout scripts/check/registry.ts`

---

## Scope

### 수정 대상 파일
```
scripts/check/
└── registry.ts  # 수정 — dead-exports 체크 등록 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `checks/cross/dead-exports.ts` | import | Step 01에서 생성한 체크 함수 import |
| `types.ts` | 간접 | CheckEntry 타입 준수 |

### Side Effect 위험
- registry.ts 수정이 다른 체크 실행에 영향을 줄 가능성 → N1에서 검증

### 참고할 기존 패턴
- `registry.ts` 내 기존 체크 등록 패턴 (name, description, group, fn)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| registry.ts (수정) | 체크 등록 대상 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| registry 등록 | registry.ts | ✅ OK |
| 통합 실행 검증 | CLI 실행 (코드 변경 아님) | ✅ OK |

### 검증 통과: ✅
