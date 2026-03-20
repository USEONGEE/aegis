# DoD (Definition of Done) - v0.2.4

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | `guarded-wdk-factory.ts`에서 자체 정의 `WalletConfig` interface 제거 | `grep -c "interface WalletConfig" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0 |
| F2 | `guarded-wdk-factory.ts`에서 자체 정의 `WalletManager` interface 제거 | `grep -c "interface WalletManager" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0 |
| F3 | `ProtocolEntry`가 WDK 타입 기반으로 재정의 (자체 `new (...args: unknown[]) => unknown` 제거) | `grep "ProtocolClass\|typeof SwapProtocol" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 1건 이상 |
| F4 | `guarded-wdk-factory.ts`에서 production unsafe cast 0건 | `grep -c 'as any\|as unknown as\|as never' packages/guarded-wdk/src/guarded-wdk-factory.ts` → 0 |
| F5 | `@tetherto/wdk-wallet`을 package.json dependencies에 추가 | `node -e "const p=require('./packages/guarded-wdk/package.json'); process.exit(p.dependencies?.['@tetherto/wdk-wallet'] ? 0 : 1)"` → exit 0 |
| F6 | WDK 타입 직접 import (`WalletManager`, Protocol classes) | `grep "from '@tetherto/wdk-wallet'" packages/guarded-wdk/src/guarded-wdk-factory.ts` → 1건 이상 |
| F7 | `createGuardedMiddleware` 반환 타입이 `IWalletAccount` 기반 (MiddlewareFunction 호환) | `grep "account: IWalletAccount.*Promise<void>" packages/guarded-wdk/src/guarded-middleware.ts` → 1건 |
| F8 | `IWalletAccount`를 `@tetherto/wdk`에서 import | `grep "from '@tetherto/wdk'" packages/guarded-wdk/src/guarded-middleware.ts` → 1건 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | guarded-wdk `npx tsc --noEmit` 통과 | `cd packages/guarded-wdk && npx tsc --noEmit` → 에러 0 |
| N2 | guarded-wdk 테스트 전수 통과 | `cd packages/guarded-wdk && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js` → 전수 통과 |
| N3 | `guarded-middleware.ts`에서 production unsafe cast 0건 | `grep -c 'as any\|as unknown as\|as never' packages/guarded-wdk/src/guarded-middleware.ts` → 0 |
| ~~N4~~ | ~~daemon typecheck~~ | 범위 밖 (PRD 비목표: daemon 패키지 변경). GuardedWDKFacade 반환 타입 정밀화로 daemon WDKInstance 호환성 깨짐 → 별도 Phase에서 daemon WDKInstance 업데이트 필요 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| ~~E1~~ | ~~daemon 호출 호환성~~ | 범위 밖 (PRD 비목표) | 별도 Phase |
| E2 | `signTypedData` 차단 로직 (EVM 전용, IWalletAccount에 없음) | optional 체크로 안전하게 접근, 런타임 에러 없음 | N2 (테스트 통과) |
| E3 | WDK의 `registerMiddleware`에 createGuardedMiddleware 결과 직접 전달 | MiddlewareFunction 타입 호환, cast 없이 컴파일 | N1 (tsc 통과) + F4 (cast 0건) |

## PRD 목표 ↔ DoD 커버리지

| PRD 목표 | DoD 항목 | 커버 |
|----------|---------|------|
| WDK 로컬 타입 재정의 제거 | F1, F2, F3, F6 | ✅ |
| unsafe cast 제거 | F4, N3 | ✅ |
| tsc 통과 (cast 없이) | N1 | ✅ |

## 설계 결정 ↔ DoD 반영

| 설계 결정 | DoD 반영 | 커버 |
|----------|---------|------|
| @tetherto/wdk-wallet 의존성 추가 | F5 | ✅ |
| WalletEntry base 타입 (breaking change) | F1, F2, F6 | ✅ |
| GuardedAccount cast-based narrowing + IWalletAccount 반환 타입 | F7, F8, E3 | ✅ |
| test-only cast 허용 | N2 (테스트 통과로 간접 검증) | ✅ |
