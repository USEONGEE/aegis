# Step 03: canonical - 테스트 벡터 + 크로스 플랫폼 검증

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 01, Step 02

---

## 1. 구현 내용 (design.md 기반)

`packages/canonical/tests/vectors.json` 테스트 벡터 파일 생성. Node.js(daemon)와 RN App(JS)이 동일한 입력에 대해 동일한 해시를 생성하는지 크로스 플랫폼 검증 (DoD F52).

### 테스트 벡터 포맷

```json
{
  "sortKeysDeep": [
    { "input": {"b":1,"a":2}, "expected": {"a":2,"b":1} },
    { "input": {"b":{"d":1,"c":2},"a":3}, "expected": {"a":3,"b":{"c":2,"d":1}} },
    { "input": [{"b":1,"a":2}], "expected": [{"a":2,"b":1}] },
    { "input": {}, "expected": {} },
    { "input": [], "expected": [] }
  ],
  "intentHash": [
    {
      "input": { "chain": "ethereum", "to": "0xAbC", "data": "0xDef", "value": "0" },
      "normalized": { "chain": "ethereum", "data": "0xdef", "to": "0xabc", "value": "0" },
      "expected": "<sha256 hex>"
    },
    {
      "input": { "chain": "arbitrum", "to": "0xAABBCC", "data": "0x1234ABCD", "value": "1000000000000000000" },
      "normalized": { "chain": "arbitrum", "data": "0x1234abcd", "to": "0xaabbcc", "value": "1000000000000000000" },
      "expected": "<sha256 hex>"
    }
  ],
  "policyHash": [
    {
      "input": [{"type":"call","permissions":[{"target":"0xABC","selector":"0x12345678","decision":"AUTO"}]}],
      "expected": "<sha256 hex>"
    }
  ]
}
```

### 벡터 생성 방식

1. 벡터 파일의 `expected` 값은 Step 02에서 구현한 함수로 1회 생성 후 고정
2. 테스트는 고정된 expected 값과 비교 (골든 테스트)
3. RN App에서도 동일 벡터 파일을 import하여 검증 가능

### 테스트 내용

- `vectors.test.js`: vectors.json의 모든 케이스를 순회하며 `sortKeysDeep`, `intentHash`, `policyHash` 결과가 expected와 일치하는지 검증
- 대소문자 혼합 address → 동일 해시 확인 (DoD E13)
- 동일 입력 반복 호출 → 결정론적 출력 확인

## 2. 완료 조건
- [ ] `packages/canonical/tests/vectors.json` 파일이 존재하고 유효한 JSON
- [ ] `sortKeysDeep` 벡터 5개 이상 (빈 객체, 빈 배열, 중첩, 배열 내 객체 포함)
- [ ] `intentHash` 벡터 3개 이상 (대소문자 혼합 address, 다른 chain, 큰 value 포함)
- [ ] `policyHash` 벡터 2개 이상 (중첩 객체, 비정렬 키 포함)
- [ ] `vectors.test.js`가 모든 벡터를 순회하며 expected와 비교
- [ ] `intentHash` 벡터에서 `0xAbC`와 `0xabc`가 동일한 expected 해시
- [ ] 반복 호출 결정론성 테스트 포함 (같은 입력 10회 → 모두 동일 출력)
- [ ] `npm test -- packages/canonical` 통과

## 3. 롤백 방법
- `packages/canonical/tests/vectors.json` 삭제
- `packages/canonical/tests/vectors.test.js` 삭제

---

## Scope

### 신규 생성 파일
```
packages/canonical/tests/
  vectors.json          # 테스트 벡터 (고정 입출력)
  vectors.test.js       # 벡터 기반 단위 테스트
```

### 수정 대상 파일
```
없음
```

### Side Effect 위험
- 없음 (테스트 파일만 추가, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| vectors.json | 크로스 플랫폼 검증용 벡터 (DoD F52) | ✅ OK |
| vectors.test.js | 벡터 기반 골든 테스트 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| sortKeysDeep 벡터 | ✅ vectors.json | OK |
| intentHash 벡터 | ✅ vectors.json | OK |
| policyHash 벡터 | ✅ vectors.json | OK |
| 대소문자 정규화 검증 | ✅ vectors.test.js | OK |
| 결정론성 검증 | ✅ vectors.test.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 04: guarded-wdk - 에러 클래스 확장](step-04-errors.md)
