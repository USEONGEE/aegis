# Step 01: PRD.md manifest 서술 정정

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: 없음

## 1. 구현 내용
1. "manifest → policy 변환은 RN App 또는 CLI에서" → "DeFi CLI에서 (`--policy` 플래그)"
2. "manifest/ ← Layer 2 (policy 카탈로그, daemon·앱 공통)" → "manifest/ ← Layer 2 (policy 카탈로그, DeFi CLI용)"
3. DeFi CLI `--policy` 패턴을 공식 policy 획득 흐름으로 추가
4. policy 요청 흐름 정정: "AI가 DeFi CLI `--policy`로 policy JSON 획득 → policyRequest tool_call" 서술 추가/정정

## 2. 완료 조건
- [ ] `grep "RN App.*manifest\|manifest.*RN App" docs/PRD.md` → 매칭 없음
- [ ] `grep "daemon.*앱.*공통\|앱.*공통" docs/PRD.md` → 매칭 없음
- [ ] `grep "\-\-policy" docs/PRD.md` → 존재
- [ ] `grep "policyRequest" docs/PRD.md` → --policy와 policyRequest가 같은 흐름으로 기술

## 3. 롤백 방법
- `git checkout docs/PRD.md`

## Scope

### 수정 대상 파일
- `docs/PRD.md` — manifest 관련 서술 2줄 정정 + --policy 흐름 추가

### 신규 생성 파일
없음

### Side Effect 위험
- historical artifact 문서 (v0.1.0 micro step-13, step-40)와의 불일치 — 의도적, 수정 안 함

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| docs/PRD.md | F1, F2, F3 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| manifest 소비자 정정 | ✅ PRD.md | OK |
| "daemon·앱 공통" → "DeFi CLI용" | ✅ PRD.md | OK |
| --policy 패턴 추가 | ✅ PRD.md | OK |
| policyRequest tool_call 흐름 정정 | ✅ PRD.md | OK |

### 검증 통과: ✅
