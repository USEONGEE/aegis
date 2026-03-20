# Step 01: WDK 타입 안전성 — 전체 리팩토링

## 메타데이터
- **난이도**: 🟠 중간
- **롤백 가능**: ✅
- **선행 조건**: 없음

---

## 1. 구현 내용 (DESIGN Phase A-D, 단일 원자적 커밋)

### Phase A: 의존성 추가
- `package.json`: `@tetherto/wdk-wallet` dependencies 추가

### Phase B: factory.ts 리팩토링
- 자체 `WalletConfig`, `WalletManager`, `ProtocolEntry` interface 제거
- WDK 타입 import 추가 (`WalletManager`, Protocol classes, `IWalletAccountWithProtocols`, `FeeRates`)
- `WalletEntry`, `ProtocolEntry` WDK 타입 기반으로 재정의
- `as any` 캐스트 제거: `const wdk = new WDK(seed)`
- `GuardedWDKFacade` 반환 타입 정밀화

### Phase C: middleware.ts 타입 호환성
- `IWalletAccount` import 추가
- `GuardedAccount`를 `extends IWalletAccount`로 변경
- `createGuardedMiddleware` 반환 타입을 `(account: IWalletAccount) => Promise<void>`로 변경
- `signTypedData` 접근을 optional 체크로 변경
- production unsafe cast 제거

### Phase D: 테스트 조정
- factory.test.ts Mock 타입 조정 (test-only cast 허용)
- 전체 테스트 + tsc + daemon tsc 검증

## 2. 완료 조건
- [ ] F1: `grep -c "interface WalletConfig" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0
- [ ] F2: `grep -c "interface WalletManager" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0
- [ ] F3: `grep "ProtocolClass\|typeof SwapProtocol" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 1건 이상
- [ ] F4: `grep -c 'as any\|as unknown as\|as never' packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0
- [ ] F5: `node -e "const p=require('./packages/guarded-wdk/package.json'); process.exit(p.dependencies?.['@tetherto/wdk-wallet'] ? 0 : 1)"` → exit 0
- [ ] F6: `grep "from '@tetherto/wdk-wallet'" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 1건 이상
- [ ] F7: `grep "extends IWalletAccount" packages/guarded-wdk/src/guarded-middleware.ts` → 1건
- [ ] F8: `grep "account: IWalletAccount.*Promise<void>" packages/guarded-wdk/src/guarded-middleware.ts` → 1건
- [ ] N1: `cd packages/guarded-wdk && npx tsc --noEmit` → 에러 0
- [ ] N2: `cd packages/guarded-wdk && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js` → 전수 통과
- [ ] N3: `grep -c 'as any\|as unknown as\|as never' packages/guarded-wdk/src/guarded-middleware.ts` → 0
- [ ] N4: `cd packages/daemon && npx tsc --noEmit` → 에러 0

## 3. 롤백 방법
- `git revert` — 단일 커밋 원자적 롤백

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/
├── package.json                    # 수정 - @tetherto/wdk-wallet 의존성 추가
├── src/guarded-wdk-factory.ts      # 수정 - 핵심 리팩토링 (자체 타입 제거 + WDK 타입 import + as any 제거)
├── src/guarded-middleware.ts       # 수정 - GuardedAccount extends IWalletAccount + 반환 타입
└── tests/factory.test.ts           # 수정 - Mock 타입 조정 (test-only cast 허용)
```

### Side Effect 위험
- daemon `wdk-host.ts`: `wallets: {}`, `protocols: {}`로 호출 — N4로 검증
- `GuardedAccount` 타입 사용 외부 파일 확인 필요 (index.ts re-export)

## FP/FN 검증
### 검증 통과: ✅

---

→ 완료: 최종 검증 (tsc + jest + daemon tsc)
