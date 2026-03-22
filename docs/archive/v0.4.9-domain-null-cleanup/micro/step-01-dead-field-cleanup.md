# Step 01: Dead Field + VerificationTarget DU

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (단일 커밋 revert)
- **선행 조건**: 없음

## 1. 구현 내용 (design.md 기반)
- `VerificationContext`에서 `currentPolicyVersion` 필드 삭제 (dead field — 항상 null)
- `expectedTargetHash: string | null` → `VerificationTarget` DU 전환
- `ExecutionJournal.getStatus()` dead method 삭제

## 2. 완료 조건
- [ ] `grep -r 'currentPolicyVersion' packages/` 결과 0건
- [ ] `VerificationTarget` DU (`verify_hash` | `skip_hash`) 존재
- [ ] `getStatus` 메서드가 `execution-journal.ts`에 없음
- [ ] `npx tsc -p packages/guarded-wdk/tsconfig.json --noEmit` 통과
- [ ] 기존 테스트 통과

## 3. 롤백 방법
- `git revert <commit>` — 단일 파일 2개 변경

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── approval-verifier.ts    # VerificationContext → VerificationTarget DU
├── signed-approval-broker.ts  # verificationContext 구성 변경
└── execution-journal.ts    # getStatus() 삭제
```

### Side Effect 위험
- 없음 (caller 1곳, dead method 삭제)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| approval-verifier.ts | VerificationContext 정의 + 검증 로직 | ✅ OK |
| signed-approval-broker.ts | VerificationContext 구성 (caller) | ✅ OK |
| execution-journal.ts | getStatus() dead method | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| currentPolicyVersion 삭제 | ✅ | OK |
| VerificationTarget DU | ✅ | OK |
| getStatus 삭제 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: Default Value Conversions](step-02-default-values.md)
