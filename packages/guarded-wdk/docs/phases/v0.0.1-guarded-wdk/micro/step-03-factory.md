# Step 03: guarded-wdk-factory.js + index.js

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (파일 삭제)
- **선행 조건**: Step 01, Step 02

---

## 1. 구현 내용 (design.md 기반)

### guarded-wdk-factory.js
- `createGuardedWDK(config)` 함수
  - 내부에서 `new WDK(seed)` 생성 (클로저에 숨김)
  - 지갑/프로토콜 등록 (`registerWallet`, `registerProtocol`)
  - 체인별 guarded middleware 등록 (`registerMiddleware`)
  - Node.js EventEmitter 인스턴스 생성
  - policy를 deep copy하여 내부 보관
- facade 반환:
  - `getAccount(chain, index)` → `wdk.getAccount()` + Object.freeze
  - `getAccountByPath(chain, path)`
  - `getFeeRates(chain)`
  - `updatePolicies(chain, newPolicies)` — immutable snapshot 교체 (deep copy)
  - `on/off` — EventEmitter 위임
  - `dispose()` — wdk.dispose()
- raw WDK, seed가 facade 외부에서 접근 불가 (F22)
- Object.freeze 적용 (F23)
- policy 초기 validation (E10)

### index.js
- `createGuardedWDK` re-export

## 2. 완료 조건
- [ ] `src/guarded/guarded-wdk-factory.js` 생성
- [ ] `src/guarded/index.js` 생성
- [ ] createGuardedWDK(config) 호출 시 facade 반환 (F1)
- [ ] facade.getAccount()가 guarded account 반환, instanceof WalletAccountEvm 통과 (F2)
- [ ] facade에 wdk, seed, _wallets 속성 없음 (F22)
- [ ] 반환된 account에 Object.freeze 적용됨 (F23)
- [ ] updatePolicies() 후 새 policy 적용 (F19)
- [ ] updatePolicies()는 immutable snapshot — 외부 mutation 영향 없음 (F20)
- [ ] on/off로 이벤트 핸들러 등록/해제 가능
- [ ] 기존 WDK 모듈 코드 수정 없음 (N3)
- [ ] 신규 파일 5개만 (N4)
- [ ] Bare 미지원 모듈 import 없음 (N5)
- [ ] 린트 통과
- [ ] 테스트 통과

## 3. 롤백 방법
- `rm src/guarded/guarded-wdk-factory.js src/guarded/index.js`

---

## Scope

### 신규 생성 파일
```
src/guarded/
├── guarded-wdk-factory.js  # 신규 — factory
└── index.js                # 신규 — re-export

tests/guarded/
└── factory.test.js         # 신규 — factory integration test
```

### 수정 대상 파일
```
package.json  # exports에 "./guarded" subpath 추가
```

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| guarded-middleware.js | import | createGuardedMiddleware |
| errors.js | 간접 (middleware 경유) | |
| approval-broker.js | config에서 주입 | |
| node:events | import | EventEmitter |
| WDK (wdk-manager.js) | import | new WDK() |

### Side Effect 위험
없음 (신규 파일, 기존 코드 수정 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| guarded-wdk-factory.js | F1, F2, F19-F23 | ✅ OK |
| index.js | 진입점 | ✅ OK |
| factory.test.js | F1, F2, F19-F23 검증 | ✅ OK |

### False Negative (누락)
없음

### 검증 통과: ✅

---

→ 다음: [Step 04: Integration Tests](step-04-integration-tests.md)
