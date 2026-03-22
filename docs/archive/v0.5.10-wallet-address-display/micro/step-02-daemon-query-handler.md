# Step 02: Daemon Query Handler getWalletAddress Case 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)
- `query-handler.ts`에 `getWalletAddress` case 추가
- `facade.getAccount(chain, accountIndex).getAddress()` 호출하여 주소 반환
- 기존 `getPortfolio` case의 AccountProvider 패턴을 동일하게 사용

## 2. 완료 조건
- [ ] `case 'getWalletAddress'` 분기가 query-handler.ts에 존재
- [ ] `facade.getAccount()` 없을 때 에러 반환 (getPortfolio와 동일 가드)
- [ ] `{ requestId, status: 'ok', data: { address: string } }` 형태로 반환
- [ ] `npx tsc --noEmit` 통과 (daemon 패키지)

## 3. 롤백 방법
- 해당 case 블록 제거 → 원복

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/query-handler.ts  # getWalletAddress case 추가
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| protocol/query.ts | 직접 참조 | Step 01의 타입 사용 |
| AccountProvider interface | 재사용 | 기존 인터페이스 그대로 |

### Side Effect 위험
없음 — 새 case 추가만, 기존 switch 미영향

### 참고할 기존 패턴
- `query-handler.ts:55-63` — getPortfolio case (AccountProvider 사용 패턴)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| query-handler.ts | case 추가 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| getWalletAddress case | ✅ | OK |
| AccountProvider 가드 | ✅ (기존 패턴 재사용) | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: useWalletStore](step-03-wallet-store.md)
