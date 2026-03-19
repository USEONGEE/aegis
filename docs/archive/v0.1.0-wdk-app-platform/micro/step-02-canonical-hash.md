# Step 02: canonical - intentHash + policyHash

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: Step 01

---

## 1. 구현 내용 (design.md 기반)

`packages/canonical`에 해시 함수 추가.

- `intentHash({ chain, to, data, value })`: SHA-256 of canonical { chain, to(lowercase), data(lowercase), value(decimal string) }, 키 알파벳 정렬
- `policyHash(policies)`: SHA-256 of `policies.map(sortKeysDeep)`, JSON.stringify(null, 0)
- SHA-256은 Node.js `crypto.createHash('sha256')` 사용

## 2. 완료 조건
- [ ] `intentHash({ chain:'ethereum', to:'0xAbC', data:'0xDef', value:'0' })` 가 lowercase 정규화 후 알려진 해시를 반환
- [ ] `intentHash`의 키 순서가 `chain, data, to, value` (알파벳)
- [ ] `policyHash([{type:'call', permissions:[{target:'0xABC'}]}])` 가 address lowercase + 키 정렬 후 알려진 해시 반환
- [ ] 동일 입력 → 항상 동일 해시 (결정론적)
- [ ] 반환값은 `0x` 접두사 + hex string
- [ ] `npm test -- packages/canonical` 통과

## 3. 롤백 방법
- `src/index.js`에서 해시 함수 제거

---

## Scope

### 수정 대상 파일
```
packages/canonical/src/index.js    # intentHash, policyHash 추가
```

### 신규 생성 파일
```
packages/canonical/tests/hash.test.js   # 해시 단위 테스트
```

### Side Effect 위험
- 없음 (기존 sortKeysDeep/canonicalJSON에 영향 없음)

## FP/FN 검증

### False Positive (과잉)
없음

### False Negative (누락)
없음

### 검증 통과: ✅

---

→ 다음: [Step 03: canonical - 테스트 벡터](step-03-canonical-test-vectors.md)
