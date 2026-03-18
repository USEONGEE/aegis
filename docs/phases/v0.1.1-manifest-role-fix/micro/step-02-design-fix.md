# Step 02: v0.1.0 design.md 의존 방향 정정

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01

## 1. 구현 내용
1. 의존 방향 그래프에서 `app ──► manifest` 제거
2. `DeFi CLI ──► manifest` 명시
3. Ownership Boundary에서 manifest = "DeFi CLI용 카탈로그"

## 2. 완료 조건
- [ ] design.md 의존 방향에 `app ──► manifest` 없음
- [ ] design.md Ownership에 manifest = DeFi CLI 명시
- [ ] 242 테스트 통과

## 3. 롤백 방법
- `git checkout docs/phases/v0.1.0-wdk-app-platform/design.md`

## Scope

### 수정 대상 파일
- `docs/phases/v0.1.0-wdk-app-platform/design.md` — 의존 방향 + Ownership 정정

### 신규 생성 파일
없음

### Side Effect 위험
- v0.1.0 micro 문서 (step-13, step-40)와 불일치 — 의도적 (historical artifact)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| v0.1.0 design.md | F4, F5 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 의존 방향 정정 | ✅ design.md | OK |
| Ownership 정정 | ✅ design.md | OK |

### 검증 통과: ✅
