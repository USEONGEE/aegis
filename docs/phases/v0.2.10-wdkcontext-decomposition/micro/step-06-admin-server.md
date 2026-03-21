# Step 06: admin-server.ts 변경 (wdkContext 제거 + store: AdminStorePort)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (git revert)
- **선행 조건**: Step 01 (ports.ts에서 AdminStorePort export)

---

## 1. 구현 내용 (design.md 7.6 기반)

- `import type { WDKContext } from './tool-surface.js'` 제거
- `import type { AdminStorePort } from './ports.js'` 추가
- `AdminServerOptions` interface에서:
  - `wdkContext: WDKContext` 필드 제거 (dead field)
  - `store: any` -> `store: AdminStorePort` 타입 교체
- 클래스 내부:
  - `private _wdkContext: WDKContext` 필드 제거
  - `private _store: any` -> `private _store: AdminStorePort` 타입 교체
  - 생성자에서 `this._wdkContext = opts.wdkContext` 할당 제거

## 2. 완료 조건

- [ ] `WDKContext`라는 이름이 admin-server.ts에 없음 (`rg 'WDKContext' packages/daemon/src/admin-server.ts` 결과 0건)
- [ ] `wdkContext` 필드/참조가 admin-server.ts에 없음 (`rg 'wdkContext' packages/daemon/src/admin-server.ts` 결과 0건)
- [ ] `AdminStorePort`가 import 되어 있음 (`rg 'AdminStorePort' packages/daemon/src/admin-server.ts` 결과 1건 이상)
- [ ] `store: any`가 admin-server.ts에 없음 (`rg 'store: any' packages/daemon/src/admin-server.ts` 결과 0건)
- [ ] `_store` 필드 타입이 `AdminStorePort`임
- [ ] `AdminServerOptions`에 `wdkContext` 멤버가 없음
- [ ] `_dispatch` 메서드 내부의 `this._store.listSigners()`, `this._store.listWallets()` 호출은 변경 없음 (AdminStorePort가 해당 메서드를 정의하므로)

## 3. 롤백 방법

- 롤백 절차: `git revert <commit>` (Step 06 커밋)
- 영향 범위: index.ts에서 AdminServer 생성 시 wdkContext 전달부 (Step 07에서 정합)

---

## Scope

### 수정 대상 파일
```
packages/daemon/src/
└── admin-server.ts  # 수정 - wdkContext 제거, store: any -> AdminStorePort, import 변경
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| `./tool-surface.js` | import 제거 | WDKContext import 삭제 |
| `./ports.js` | 신규 import | AdminStorePort 타입 가져옴 |
| `index.ts` | 간접 영향 | AdminServer 생성자에 wdkContext를 더 이상 넘기지 않아야 함 (Step 07) |

### Side Effect 위험
- **signer_list, wallet_list 명령어 동작**: `this._store`의 타입이 `any`에서 `AdminStorePort`로 좁아지므로, `listSigners()`와 `listWallets()` 이외의 store 메서드를 실수로 호출하면 컴파일 에러가 됨. 이는 의도된 효과 (타입 안전성 확보).
- **_dispatch 내부의 signers.map 타입 캐스팅**: 현재 `(d: { publicKey: string; name: string | null; ... })` 형태의 인라인 타입이 사용됨. AdminStorePort의 `listSigners()` 반환 타입이 `Promise<StoredSigner[]>`이면 이 캐스팅이 불필요해질 수 있으나, 기존 동작을 유지하기 위해 이번 단계에서는 변경하지 않음.

### 참고할 기존 패턴
- `packages/daemon/src/admin-server.ts:6`: `import type { WDKContext }` (삭제)
- `packages/daemon/src/admin-server.ts:15-23`: AdminServerOptions (wdkContext 제거, store 타입 변경)
- `packages/daemon/src/admin-server.ts:57`: `private _store: any` (타입 변경)
- `packages/daemon/src/admin-server.ts:61`: `private _wdkContext: WDKContext` (삭제)
- `packages/daemon/src/admin-server.ts:72`: `this._wdkContext = opts.wdkContext` (삭제)

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| admin-server.ts | design.md 7.6: wdkContext 제거 + store: any -> AdminStorePort | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| WDKContext import 제거 | ✅ admin-server.ts | OK |
| AdminStorePort import 추가 | ✅ admin-server.ts | OK |
| AdminServerOptions.wdkContext 제거 | ✅ admin-server.ts | OK |
| AdminServerOptions.store: any -> AdminStorePort | ✅ admin-server.ts | OK |
| _wdkContext 필드 제거 | ✅ admin-server.ts | OK |
| _store 타입 변경 | ✅ admin-server.ts | OK |
| 생성자 wdkContext 할당 제거 | ✅ admin-server.ts | OK |

### 검증 체크리스트
- [x] Scope의 모든 파일이 구현 내용과 연결됨
- [x] 구현 내용의 모든 항목이 Scope에 반영됨
- [x] 불필요한 파일(FP)이 제거됨
- [x] 누락된 파일(FN)이 추가됨

### 검증 통과: ✅

---

> 다음: [Step 07: index.ts 변경](step-07-index.md)
