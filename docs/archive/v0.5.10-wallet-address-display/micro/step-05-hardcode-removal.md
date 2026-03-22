# Step 05: accountIndex 하드코딩 제거 (Policy, Settings)

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 03 (useWalletStore)

---

## 1. 구현 내용 (design.md 기반)
- PolicyScreen.tsx의 `accountIndex: 0` → `useWalletStore.selectedAccountIndex`
- SettingsScreen.tsx의 `accountIndex: 0` → `useWalletStore.selectedAccountIndex`

## 2. 완료 조건
- [ ] PolicyScreen.tsx에 `accountIndex: 0` 하드코딩 없음
- [ ] SettingsScreen.tsx (DevSettingsScreen)에 `accountIndex: 0` 하드코딩 없음
- [ ] `grep -rn 'accountIndex: 0' packages/app/src/` 결과 0건
- [ ] `npx tsc --noEmit` 통과

## 3. 롤백 방법
- git 복원 → 원복

---

## Scope

### 수정 대상 파일
```
packages/app/src/domains/policy/screens/PolicyScreen.tsx     # accountIndex: 0 → store 참조 (3곳)
packages/app/src/domains/settings/screens/DevSettingsScreen.tsx  # accountIndex: 0 → store 참조 (1곳)
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| useWalletStore | 직접 참조 | selectedAccountIndex 사용 |

### Side Effect 위험
없음 — 값 소스만 변경, 로직 동일

### 참고할 기존 패턴
- Step 04에서 DashboardScreen에 적용한 동일 패턴

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| PolicyScreen.tsx | accountIndex 하드코딩 3곳 제거 | ✅ OK |
| DevSettingsScreen.tsx | accountIndex 하드코딩 1곳 제거 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Policy 하드코딩 제거 | ✅ | OK |
| Settings 하드코딩 제거 | ✅ | OK |

### 검증 통과: ✅
