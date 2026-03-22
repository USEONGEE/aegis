# Step 01: Protocol getWalletAddress Query 타입 추가

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)
- `packages/protocol/src/query.ts`에 `getWalletAddress` QueryType 추가
- QueryMessage discriminated union에 해당 variant 추가

## 2. 완료 조건
- [ ] QueryType에 `'getWalletAddress'` 리터럴 추가됨
- [ ] QueryMessage에 `{ type: 'getWalletAddress'; requestId: string; params: { chain: string; accountIndex: number } }` variant 추가됨
- [ ] `npx tsc --noEmit` 통과 (protocol 패키지)

## 3. 롤백 방법
- 해당 라인 제거 → 원복

---

## Scope

### 수정 대상 파일
```
packages/protocol/src/query.ts  # QueryType + QueryMessage 확장
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| daemon/query-handler.ts | 간접 영향 | Step 02에서 case 추가 |

### Side Effect 위험
없음 — 타입 추가만, 기존 코드 미영향

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| query.ts | QueryType + QueryMessage 확장 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| QueryType 추가 | ✅ | OK |
| QueryMessage variant | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: Daemon Query Handler](step-02-daemon-query-handler.md)
