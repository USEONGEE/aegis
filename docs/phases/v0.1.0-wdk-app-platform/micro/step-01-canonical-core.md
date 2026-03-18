# Step 01: canonical - sortKeysDeep + canonicalJSON

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md 기반)

`packages/canonical` 패키지 생성. 모든 패키지(guarded-wdk, daemon, app, manifest)가 해시 일관성을 위해 import하는 단일 구현.

- `sortKeysDeep(obj)`: 객체의 모든 키를 재귀적으로 알파벳 정렬
- `canonicalJSON(obj)`: `sortKeysDeep` + `JSON.stringify(obj, null, 0)` (공백 없음)
- 정규화 규칙: address → lowercase, 숫자 → decimal string

## 2. 완료 조건
- [ ] `packages/canonical/package.json` 생성 (name: `@wdk-app/canonical`)
- [ ] `packages/canonical/src/index.js` 에서 `sortKeysDeep`, `canonicalJSON` export
- [ ] `sortKeysDeep({b:1, a:2})` → `{a:2, b:1}`
- [ ] `sortKeysDeep({b: {d:1, c:2}, a:3})` → `{a:3, b: {c:2, d:1}}` (재귀)
- [ ] 배열 내부 객체도 키 정렬: `[{b:1, a:2}]` → `[{a:2, b:1}]`
- [ ] 빈 객체/배열 보존: `{}` → `{}`, `[]` → `[]`
- [ ] `canonicalJSON` 출력에 공백 없음
- [ ] 루트 `package.json` workspaces에 `packages/canonical` 추가
- [ ] `npm test -- packages/canonical` 통과

## 3. 롤백 방법
- `packages/canonical` 디렉토리 삭제
- 루트 `package.json`에서 workspace 제거

---

## Scope

### 신규 생성 파일
```
packages/canonical/
  package.json
  src/
    index.js          # sortKeysDeep, canonicalJSON export
  tests/
    canonical.test.js # 단위 테스트
```

### 수정 대상 파일
```
package.json          # workspaces에 packages/canonical 추가
```

### Side Effect 위험
- 없음 (신규 패키지, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| packages/canonical/src/index.js | sortKeysDeep + canonicalJSON | ✅ OK |
| packages/canonical/tests/canonical.test.js | 단위 테스트 | ✅ OK |
| package.json (루트) | workspaces 설정 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| sortKeysDeep | ✅ index.js | OK |
| canonicalJSON | ✅ index.js | OK |
| 정규화 규칙 (lowercase, decimal) | ✅ index.js | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: canonical - intentHash + policyHash](step-02-canonical-hash.md)
