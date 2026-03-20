# v0.2.4 Design -- WDK 외부 타입 직접 참조 리팩토링 계획

## 요약

`guarded-wdk-factory.ts`에서 자체 정의한 3개 인터페이스(`WalletConfig`, `WalletManager`, `ProtocolEntry`)를 제거하고, `@tetherto/wdk` 및 `@tetherto/wdk-wallet`이 export하는 실제 타입으로 대체한다. 동시에 `as any` 캐스트를 완전히 제거하여 WDK 메서드 호출의 타입 안전성을 확보한다.

---

## 현재 상태 분석

### 파일: `packages/guarded-wdk/src/guarded-wdk-factory.ts`

#### 문제 1: 자체 정의 `WalletConfig` (line 8-11)

```ts
// 현재 (자체 정의)
interface WalletConfig {
  Manager: new (seed: string, config: unknown) => WalletManager
  config: unknown
}
```

WDK 실제 시그니처:
```ts
// @tetherto/wdk (wdk-manager.d.ts line 39)
registerWallet<W extends typeof WalletManager>(
  blockchain: string,
  WalletManager: W,
  config: ConstructorParameters<W>[1]
): WdkManager
```

**불일치**: 자체 `WalletConfig.Manager`는 인스턴스 생성자만 요구하고 `WalletManager` abstract class의 static 메서드(`getRandomSeedPhrase`, `isValidSeedPhrase`)를 포함하지 않는다. `config`가 `unknown`이므로 `ConstructorParameters<W>[1]`과의 타입 연결이 끊겨 있다.

#### 문제 2: 자체 정의 `WalletManager` (line 13-18)

```ts
// 현재 (자체 정의)
interface WalletManager {
  getAccount (index: number): Promise<unknown>
  getAccountByPath (path: string): Promise<unknown>
  getFeeRates (): Promise<unknown>
  dispose (): void
}
```

WDK 실제 타입 (`@tetherto/wdk-wallet` default export):
```ts
abstract class WalletManager {
  static getRandomSeedPhrase(wordCount?: 12 | 24): string
  static isValidSeedPhrase(seedPhrase: string): boolean
  constructor(seed: string | Uint8Array, config?: WalletConfig)
  abstract getAccount(index?: number): Promise<IWalletAccount>
  abstract getAccountByPath(path: string): Promise<IWalletAccount>
  abstract getFeeRates(): Promise<FeeRates>
  dispose(): void
}
```

**불일치**: 자체 인터페이스에는 static 메서드가 없고, 반환 타입이 모두 `unknown`이다.

#### 문제 3: 자체 정의 `ProtocolEntry` (line 20-24)

```ts
// 현재 (자체 정의)
interface ProtocolEntry {
  label: string
  Protocol: new (...args: unknown[]) => unknown
  config: unknown
}
```

WDK 실제 시그니처:
```ts
// @tetherto/wdk (wdk-manager.d.ts line 54)
registerProtocol<P extends typeof SwapProtocol | typeof BridgeProtocol |
  typeof LendingProtocol | typeof FiatProtocol>(
  blockchain: string, label: string,
  Protocol: P, config: ConstructorParameters<P>[1]
): WdkManager
```

**불일치**: `Protocol`이 4개 프로토콜 클래스의 유니언이 아닌 임의의 생성자. `config`가 `unknown`이므로 `ConstructorParameters<P>[1]`과의 타입 연결이 끊겨 있다.

#### 문제 4: `as any` 캐스트 (line 60)

```ts
const wdk: Record<string, (...args: any[]) => any> = new WDK(seed) as any
```

WDK 인스턴스의 모든 메서드를 `(...args: any[]) => any`로 타입 소거하여 `registerWallet`, `registerProtocol`, `registerMiddleware`, `getAccount`, `getAccountByPath`, `getFeeRates`, `dispose` 호출의 타입 안전성이 완전히 상실되어 있다.

#### 문제 5: `GuardedWDKConfig`의 optional 필드 (line 26-33)

```ts
interface GuardedWDKConfig {
  seed: string
  wallets?: Record<string, WalletConfig>       // optional
  protocols?: Record<string, ProtocolEntry[]>   // optional
  approvalBroker?: SignedApprovalBroker         // optional
  approvalStore: ApprovalStore
  trustedApprovers?: string[]                   // optional
}
```

설계 원칙 "No Optional"에 위반하지만, 이 리팩토링의 범위 밖이다. `wallets`와 `protocols`가 optional인 것은 daemon에서 `{}` 빈 객체를 전달하는 호출 패턴과 맞물려 있어 별도 Phase에서 처리한다.

### 파일: `packages/guarded-wdk/src/guarded-middleware.ts`

#### `createGuardedMiddleware` 반환 타입 호환성

```ts
// 현재 반환 타입 (line 330)
(account: GuardedAccount) => Promise<void>
```

WDK의 `MiddlewareFunction`:
```ts
// @tetherto/wdk (wdk-manager.d.ts line 103)
type MiddlewareFunction = <A extends IWalletAccount>(account: A) => Promise<void>
```

`GuardedAccount`는 자체 정의 인터페이스(line 69-80)이다. `MiddlewareFunction`은 **제네릭 함수** 타입으로, `A extends IWalletAccount`라는 제약이 있다. `createGuardedMiddleware`가 `(account: GuardedAccount) => Promise<void>`를 반환하면, `GuardedAccount`가 `IWalletAccount`의 상위 타입이 아닌 이상 할당 불가능하다.

그러나 factory.ts line 88에서 `wdk.registerMiddleware(chainKey, ...)`를 호출할 때, 현재 `wdk`가 `as any`이므로 타입 불일치가 은폐되어 있다. `as any` 제거 후 이 불일치가 표면화된다.

---

## WDK가 export하는 사용 가능 타입 목록

| 타입 | import 경로 | 종류 |
|------|------------|------|
| `WdkManager` (default) | `@tetherto/wdk` | class |
| `MiddlewareFunction` | `@tetherto/wdk` | type |
| `IWalletAccount` | `@tetherto/wdk` | interface |
| `IWalletAccountWithProtocols` | `@tetherto/wdk` | interface |
| `FeeRates` | `@tetherto/wdk` | type |
| `WalletManager` (default) | `@tetherto/wdk-wallet` | abstract class |
| `WalletConfig` | `@tetherto/wdk-wallet` | type (`{ transferMaxFee?: ... }`) |
| `IWalletAccount` | `@tetherto/wdk-wallet` | interface |
| `Transaction` | `@tetherto/wdk-wallet` | type |
| `TransactionResult` | `@tetherto/wdk-wallet` | type |
| `TransferOptions` | `@tetherto/wdk-wallet` | type |
| `SwapProtocol` | `@tetherto/wdk-wallet/protocols` | abstract class |
| `BridgeProtocol` | `@tetherto/wdk-wallet/protocols` | abstract class |
| `LendingProtocol` | `@tetherto/wdk-wallet/protocols` | abstract class |
| `FiatProtocol` | `@tetherto/wdk-wallet/protocols` | abstract class |

**주의**: `@tetherto/wdk-wallet`은 현재 `package.json`의 직접 의존성이 아니다. `@tetherto/wdk`의 transitive dependency이다. 타입 import를 위해 `devDependencies`에 추가하거나, `@tetherto/wdk`의 re-export를 통해 접근해야 한다.

`@tetherto/wdk`의 `types/index.d.ts`는 다음을 re-export한다:
```ts
export type IWalletAccount = import("./src/wdk-manager.js").IWalletAccount;
export type FeeRates = import("./src/wdk-manager.js").FeeRates;
export type MiddlewareFunction = import("./src/wdk-manager.js").MiddlewareFunction;
```

`WalletManager` abstract class와 Protocol abstract class는 `@tetherto/wdk`의 `types/src/wdk-manager.d.ts`에서 import되어 WdkManager의 제네릭 제약에 사용되지만, `@tetherto/wdk`의 public export로 re-export되지 않는다.

따라서 `@tetherto/wdk-wallet`을 직접 의존성(또는 devDependencies)에 추가하는 것이 필요하다.

---

## 제안된 리팩토링 계획

### Step 1: `@tetherto/wdk-wallet` 의존성 추가

**파일**: `packages/guarded-wdk/package.json`

`@tetherto/wdk-wallet`을 `dependencies`에 추가한다. (WDK가 이미 transitive로 설치하지만, 직접 import하려면 명시적 의존성이 필요하다.)

```json
{
  "dependencies": {
    "@tetherto/wdk": "^1.0.0-beta.6",
    "@tetherto/wdk-wallet": "^1.0.0-beta.7",
    ...
  }
}
```

**위험**: 낮음. 이미 transitive dependency로 설치되어 있으므로 버전 충돌 가능성 낮음.

**검증**: `pnpm install` 후 `pnpm ls @tetherto/wdk-wallet`로 해결 여부 확인.

---

### Step 2: `guarded-wdk-factory.ts` -- 자체 타입 제거 + WDK 타입 import

**파일**: `packages/guarded-wdk/src/guarded-wdk-factory.ts`

#### 2a. import 변경

```ts
// 제거
// (자체 정의 WalletConfig, WalletManager, ProtocolEntry 인터페이스 전체 제거)

// 추가
import WDK from '@tetherto/wdk'
import type { MiddlewareFunction, IWalletAccountWithProtocols, FeeRates } from '@tetherto/wdk'
import WalletManager from '@tetherto/wdk-wallet'
import { SwapProtocol, BridgeProtocol, LendingProtocol, FiatProtocol } from '@tetherto/wdk-wallet/protocols'
```

#### 2b. `GuardedWDKConfig` 타입 재정의

WDK의 `registerWallet`과 `registerProtocol` 시그니처에 맞추되, factory의 config 객체에서 사용하는 형태를 유지한다.

```ts
// WDK registerWallet의 시그니처:
//   registerWallet<W extends typeof WalletManager>(blockchain: string, WalletManager: W, config: ConstructorParameters<W>[1])
//
// config 객체에서는 { Manager, config } 쌍으로 전달하므로:

interface WalletEntry<W extends typeof WalletManager = typeof WalletManager> {
  Manager: W
  config: ConstructorParameters<W>[1]
}

// WDK registerProtocol의 시그니처:
//   registerProtocol<P extends typeof SwapProtocol | ...>(blockchain: string, label: string, Protocol: P, config: ConstructorParameters<P>[1])

type ProtocolClass = typeof SwapProtocol | typeof BridgeProtocol | typeof LendingProtocol | typeof FiatProtocol

interface ProtocolEntry<P extends ProtocolClass = ProtocolClass> {
  label: string
  Protocol: P
  config: ConstructorParameters<P>[1]
}
```

**핵심 변경**: `WalletEntry.Manager`가 `typeof WalletManager`를 extends하도록 제약하여, WDK의 `registerWallet` 제네릭 제약과 일치시킨다. `ProtocolEntry.Protocol`도 4개 프로토콜 클래스의 유니언으로 제약한다.

**타입 소거 문제**: `GuardedWDKConfig`에서 `Record<string, WalletEntry>`를 사용하면 각 엔트리의 구체적 `W` 타입이 소거된다. 이는 WDK의 `registerWallet`이 호출 시점에서 제네릭을 추론하므로, `wallet.Manager`와 `wallet.config`를 함께 전달하면 TypeScript가 추론할 수 있다. 단, 이 추론이 정확하게 동작하려면 `WalletEntry`를 non-generic으로 사용하되, `Manager`의 타입을 `typeof WalletManager`로 유지해야 한다.

실용적 접근:
```ts
interface WalletEntry {
  Manager: typeof WalletManager
  config: ConstructorParameters<typeof WalletManager>[1]
}
```

이렇게 하면 `config`는 `WalletConfig | undefined` (`{ transferMaxFee?: number | bigint }`)가 된다. 그러나 실제 WalletManager 서브클래스의 생성자는 더 구체적인 config를 요구할 수 있다.

WDK의 `registerWallet`은 `config: ConstructorParameters<W>[1]`로 서브클래스의 정확한 config 타입을 추론하므로, factory에서 `wdk.registerWallet(chainKey, wallet.Manager, wallet.config)`를 호출할 때 `wallet.Manager`가 `typeof WalletManager`이면 `config`는 base `WalletConfig | undefined`로 추론된다. 서브클래스의 추가 config 필드가 있더라도 base 타입의 서브타입이므로 할당 가능하다.

**결론**: `WalletEntry`에서 `Manager: typeof WalletManager`와 `config: ConstructorParameters<typeof WalletManager>[1]`을 사용한다.

#### 2c. `as any` 캐스트 제거

```ts
// 변경 전 (line 60)
const wdk: Record<string, (...args: any[]) => any> = new WDK(seed) as any

// 변경 후
const wdk = new WDK(seed)
```

`wdk`는 이제 `WDK` (즉, `WdkManager`) 인스턴스로 정확히 타입 추론된다. `registerWallet`, `registerProtocol`, `registerMiddleware`, `getAccount`, `getAccountByPath`, `getFeeRates`, `dispose` 모든 메서드가 올바른 타입으로 호출 가능해진다.

#### 2d. `GuardedWDKFacade` 반환 타입 정밀화

```ts
// 변경 전
interface GuardedWDKFacade {
  getAccount (chain: string, index?: number): Promise<unknown>
  getAccountByPath (chain: string, path: string): Promise<unknown>
  getFeeRates (chain: string): Promise<unknown>
  ...
}

// 변경 후
interface GuardedWDKFacade {
  getAccount (chain: string, index?: number): Promise<IWalletAccountWithProtocols>
  getAccountByPath (chain: string, path: string): Promise<IWalletAccountWithProtocols>
  getFeeRates (chain: string): Promise<FeeRates>
  ...
}
```

WDK의 `getAccount`과 `getAccountByPath`는 `Promise<IWalletAccountWithProtocols>`를 반환하고, `getFeeRates`는 `Promise<FeeRates>`를 반환한다.

---

### Step 3: `guarded-middleware.ts` -- `createGuardedMiddleware` 타입 호환성

#### 핵심 문제

WDK의 `MiddlewareFunction`:
```ts
type MiddlewareFunction = <A extends IWalletAccount>(account: A) => Promise<void>
```

현재 `createGuardedMiddleware` 반환 타입:
```ts
(account: GuardedAccount) => Promise<void>
```

`GuardedAccount`는 자체 정의 인터페이스이므로, `MiddlewareFunction`과 호환되지 않는다. `MiddlewareFunction`은 **제네릭 함수**로, 모든 `A extends IWalletAccount`에 대해 동작해야 한다. 반면 `createGuardedMiddleware`는 `GuardedAccount`라는 특정 타입에 대해서만 동작한다.

#### 해결 방안

`GuardedAccount` 인터페이스를 제거하고, 미들웨어 함수의 파라미터 타입을 `IWalletAccount`로 변경한다.

```ts
// 변경 전
export function createGuardedMiddleware (config: MiddlewareConfig): (account: GuardedAccount) => Promise<void> {
  return async (account: GuardedAccount) => {

// 변경 후
import type { IWalletAccount } from '@tetherto/wdk'

export function createGuardedMiddleware (config: MiddlewareConfig): MiddlewareFunction {
  return async <A extends IWalletAccount>(account: A): Promise<void> => {
```

그러나 이 접근은 함수 본문에서 `account.sendTransaction`, `account.transfer`, `account.sign`, `account.signTypedData`, `account.keyPair`, `account.dispose`, `account.getTransactionReceipt`에 접근해야 하는데, `IWalletAccount`는 이 메서드들을 모두 포함한다:

| 메서드 | `IWalletAccount`에 존재? |
|--------|:----------------------:|
| `sendTransaction(tx)` | O (`Transaction` 타입 차이 있음) |
| `transfer(options)` | O (`TransferOptions` 타입 차이 있음) |
| `sign(message)` | O |
| `signTypedData(...)` | X (EVM 전용, WDK base에 없음) |
| `keyPair` | O |
| `dispose()` | O |
| `getAddress()` | O (via `IWalletAccountReadOnly`) |
| `getTransactionReceipt(hash)` | O (via `IWalletAccountReadOnly`) |

`signTypedData`는 `IWalletAccount`에 없다. 현재 `GuardedAccount`에서 `signTypedData`를 정의하고 있지만, 이는 EVM 전용 확장이다. WDK의 base `IWalletAccount`에는 존재하지 않으므로, 미들웨어에서 `signTypedData` 차단은 `account`에 해당 프로퍼티가 존재할 때만 수행하는 조건부 로직으로 변경해야 한다.

또한 `Transaction` 타입 차이가 있다:
- WDK (`@tetherto/wdk-wallet`): `{ to: string; value: number | bigint }` (data 필드 없음)
- 자체 정의: `{ to?: string; value?: string | number | bigint | null; data?: string }`

이 차이가 중요하다. WDK의 `Transaction` 타입에는 `data` 필드가 없다. 그러나 guarded-middleware는 `tx.data`를 정책 평가에 사용한다. 이는 EVM chain의 실제 트랜잭션에서 `data` 필드가 포함되지만 WDK의 base 추상 타입에는 반영되지 않은 것이다.

**결론**: 자체 정의 `Transaction`, `TransferOptions`, `TransactionResult`, `TransactionReceipt`, `GuardedAccount` 인터페이스를 유지해야 한다. 이들은 WDK의 base 타입보다 더 구체적인(EVM 체인에 특화된) 필드를 포함하며, 이 필드들은 정책 평가에 필수적이다. 이 타입들은 **guarded-middleware 내부의 도메인 타입**이지, WDK 타입의 재정의가 아니다.

따라서 `createGuardedMiddleware`의 반환 타입을 `MiddlewareFunction`에 호환시키기 위해 다음 접근을 사용한다:

```ts
// createGuardedMiddleware는 자체 타입을 사용하여 account를 다루되,
// factory.ts에서 registerMiddleware에 전달할 때 타입을 맞춘다.

// guarded-middleware.ts: 변경 없음 (반환 타입 유지)
export function createGuardedMiddleware (config: MiddlewareConfig):
  (account: GuardedAccount) => Promise<void>

// guarded-wdk-factory.ts: registerMiddleware 호출 시
// createGuardedMiddleware의 반환값을 MiddlewareFunction으로 캐스트
wdk.registerMiddleware(chainKey, createGuardedMiddleware({...}) as unknown as MiddlewareFunction)
```

**그러나** 이는 `as unknown as`를 사용하는 것이므로 목표(`as any` 제거)에 위배된다.

#### 대안: factory에서 wrapper로 감싸기

```ts
const guardedMiddleware = createGuardedMiddleware({ ... })
wdk.registerMiddleware(chainKey, async (account) => {
  await guardedMiddleware(account as GuardedAccount)
})
```

이 wrapper에서 `account as GuardedAccount`는 **다운캐스트**이다. `IWalletAccount`가 `GuardedAccount`의 모든 필드를 포함하지 않으므로 위험하다. 그러나 실제로 WDK가 전달하는 account 객체는 EVM WalletManager의 account이므로, `sendTransaction`, `transfer`, `sign`, `keyPair`, `dispose`, `getAddress`, `getTransactionReceipt` 등의 메서드를 가지고 있다.

#### 최종 결정: `GuardedAccount`를 `IWalletAccount` 기반으로 확장

```ts
import type { IWalletAccount } from '@tetherto/wdk'

// GuardedAccount는 IWalletAccount를 extends하되, 추가 EVM 필드를 포함
interface GuardedAccount extends IWalletAccount {
  signTypedData?: (...args: unknown[]) => never
  [key: string]: unknown
}
```

이렇게 하면:
1. `GuardedAccount extends IWalletAccount`이므로 미들웨어의 타입이 호환됨
2. `signTypedData`와 같은 EVM 전용 필드는 optional로 유지
3. 인덱스 시그니처 `[key: string]: unknown`으로 동적 프로퍼티 접근 허용

단, 자체 정의 `Transaction`, `TransferOptions`, `TransactionResult`는 유지하되, 이들은 **middleware 내부 도메인 타입**으로서 WDK 타입의 재정의가 아니라 guarded-middleware의 정책 평가 로직에 필요한 EVM-specific 타입이다.

그리고 `createGuardedMiddleware` 반환 타입을 변경한다:
```ts
// 반환 타입을 제네릭으로 변경하여 MiddlewareFunction과 호환
export function createGuardedMiddleware (config: MiddlewareConfig):
  <A extends IWalletAccount>(account: A) => Promise<void>
```

함수 본문에서는 `account`를 `A extends IWalletAccount`로 받되, 내부에서 EVM-specific 필드 접근이 필요한 곳은 런타임 존재 확인 후 사용한다.

---

## 최종 채택 결정

### 결정 1: WalletEntry — base 타입 사용
```ts
interface WalletEntry {
  Manager: typeof WalletManager
  config: ConstructorParameters<typeof WalletManager>[1]  // = WalletConfig | undefined
}
```
서브클래스 config는 structural subtype이므로 런타임에 문제 없음. 단순함 우선.

### 결정 2: GuardedAccount — extends IWalletAccount
```ts
import type { IWalletAccount } from '@tetherto/wdk'

interface GuardedAccount extends IWalletAccount {
  signTypedData?: (...args: unknown[]) => never  // EVM 전용, 차단 대상
}
```
- `GuardedAccount extends IWalletAccount`이므로 `(account: GuardedAccount) => Promise<void>`가 `MiddlewareFunction`에 호환됨
- `signTypedData`는 optional로 유지 (EVM chain에서만 존재)
- 기존 코드 변경 최소화

### 결정 3: createGuardedMiddleware 반환 타입
```ts
// MiddlewareFunction = <A extends IWalletAccount>(account: A) => Promise<void>
// (account: IWalletAccount) => Promise<void>는 MiddlewareFunction에 할당 가능
// (TypeScript strictFunctionTypes에서 제네릭 함수에 비-제네릭 함수 할당 허용)

export function createGuardedMiddleware (config: MiddlewareConfig):
  (account: IWalletAccount) => Promise<void>
```
함수 본문에서 `account`를 `IWalletAccount`로 받되, 내부에서 `signTypedData` 등 EVM-specific 접근은 `GuardedAccount`로 narrow하여 사용.

### 미채택 대안
- ~~GuardedAccount 완전 제거 + IWalletAccount 직접 사용~~ → 변경 범위 과대
- ~~제네릭 WalletEntry<W>~~ → GuardedWDKConfig 복잡도 증가, Primitive First 위반
- ~~factory에서 wrapper 함수로 감싸기~~ → 불필요한 간접 계층

이 방식이 가장 깔끔하지만, middleware 함수 본문의 변경이 광범위하다. 현재 `GuardedAccount`의 프로퍼티들(`sendTransaction`, `transfer`, `sign`, `signTypedData`, `dispose`, `keyPair`, `getAddress`, `getTransactionReceipt`)은 대부분 `IWalletAccount`에도 존재하므로, 실제 변경 범위는 `signTypedData`와 `getTransactionReceipt` (IWalletAccountReadOnly에서 `Promise<unknown | null>` 반환) 정도이다.

---

### Step 4: 테스트 업데이트

#### `factory.test.ts`

`MockWalletManager`가 `typeof WalletManager`를 만족하도록 수정해야 한다. 현재 MockWalletManager는 plain class이므로 `WalletManager` abstract class를 extends해야 한다. 그러나 WDK의 `WalletManager` constructor에서 seed 유효성 검사를 수행하므로, mock에서 이를 우회해야 할 수 있다.

대안: MockWalletManager를 WalletManager의 서브클래스로 만들되, `@tetherto/wdk-wallet`에서 import한다.

```ts
import WalletManager from '@tetherto/wdk-wallet'

class MockWalletManager extends WalletManager {
  async getAccount (_index: number = 0) {
    return { ... } as unknown as IWalletAccount
  }
  async getAccountByPath (_path: string) {
    return this.getAccount(0)
  }
  async getFeeRates () {
    return { normal: 1000n, fast: 2000n }
  }
}
```

WalletManager의 constructor에서 seed를 검증하므로, 테스트에서 유효한 BIP-39 seed를 사용해야 한다. 현재 테스트 코드에서 이미 `abandon abandon ... about` (유효한 BIP-39) 시드를 사용하고 있으므로 문제 없다.

단, `WalletManager` constructor의 `config` 파라미터가 optional (`WalletConfig?`)이므로 config 전달이 불필요하다면 생략 가능하다.

**위험**: `WalletManager`의 constructor 내부 로직(seed를 Uint8Array로 변환 등)이 mock에서 side effect를 일으킬 수 있다. 테스트 환경에서 `@tetherto/wdk-wallet`의 runtime dependency가 모두 해결되어야 한다.

**대안 (낮은 위험)**: `MockWalletManager`를 WalletManager의 서브클래스로 만들지 않고, factory.test.ts에서 `makeConfig`의 `wallets` 타입을 `as any`로 우회한다. 그러나 이는 목표에 위배된다.

**실용적 결정**: test 파일에서의 `as any` / `as never` 사용은 리팩토링 목표의 예외로 둔다. 테스트에서 mock 객체를 만들 때 완전한 타입 호환성을 달성하는 것은 비용 대비 가치가 낮다. PRD에서도 "production 코드의 as any 제거"가 목표이므로, test 코드의 cast는 허용한다.

#### `integration.test.ts`

`account: MockAccount`는 현재 `createGuardedMiddleware`에 `account as never`로 전달되고 있다. 이는 현재도 캐스트를 사용하고 있으므로 test 코드의 기존 패턴과 동일하다. 변경 불필요.

---

## 단계별 구현 계획

### Phase A: 의존성 추가 [노력: 소 / 위험: 낮음]

1. `packages/guarded-wdk/package.json`에 `@tetherto/wdk-wallet: ^1.0.0-beta.7` 추가
2. `pnpm install` 실행
3. `pnpm ls @tetherto/wdk-wallet` 확인

**수락 기준**: `@tetherto/wdk-wallet`이 resolve되고, 기존 테스트 통과.

### Phase B: factory.ts 자체 타입 제거 + WDK 타입 import [노력: 중 / 위험: 중]

1. 자체 `WalletConfig`, `WalletManager`, `ProtocolEntry` 인터페이스 제거 (line 8-24)
2. WDK 타입 import 추가
3. `WalletEntry`, `ProtocolEntry` 재정의 (WDK 타입 기반)
4. `as any` 캐스트 제거 (line 60): `const wdk = new WDK(seed)`
5. `GuardedWDKFacade` 반환 타입 정밀화 (unknown -> 구체적 타입)
6. `npx tsc --noEmit` 실행하여 타입 에러 확인 및 수정

**수락 기준**: `npx tsc --noEmit` 통과, factory.ts에 `as any` 없음.

### Phase C: middleware.ts 반환 타입 호환성 [노력: 중 / 위험: 중]

1. `IWalletAccount` import 추가
2. `createGuardedMiddleware` 파라미터 타입을 `IWalletAccount`로 변경
3. `GuardedAccount` 인터페이스를 제거하거나 `IWalletAccount` extends로 변경
4. 함수 본문에서 EVM-specific 필드 접근을 런타임 확인으로 변경
5. `npx tsc --noEmit` 실행

**수락 기준**: `npx tsc --noEmit` 통과, middleware.ts에 cast 없음 (test 제외).

### Phase D: 테스트 통과 확인 [노력: 소 / 위험: 낮음]

1. `factory.test.ts`의 `MockWalletManager` 타입 조정 (필요시 test-only cast 허용)
2. 전체 테스트 수행: `pnpm test`
3. daemon의 `wdk-host.ts` 호출 코드에 타입 에러가 없는지 확인 (daemon의 경우 이미 `wallets: {}`, `protocols: {}`로 호출하므로 빈 Record와의 호환성 확인)

**수락 기준**: 6개 테스트 파일 전수 통과, `npx tsc --noEmit` 통과.

---

## 위험 평가와 완화 방안

| 위험 | 심각도 | 가능성 | 완화 방안 |
|------|--------|--------|----------|
| `WalletManager` constructor side effect in tests | 중 | 낮음 | test에서 유효한 BIP-39 시드 이미 사용 중. constructor 실패 시 test-only mock으로 분리 |
| `MiddlewareFunction` 제네릭 호환성 문제 | 중 | 중 | `strictFunctionTypes`에서의 호환성을 tsc로 검증. 불가능 시 factory에서 thin wrapper 사용 |
| daemon `wdk-host.ts` 호출 코드 타입 에러 | 낮음 | 낮음 | daemon은 `wallets: {}`, `protocols: {}`로 호출. `Record<string, WalletEntry>`에 빈 객체 할당 가능 |
| `getTransactionReceipt` 반환 타입 차이 | 낮음 | 높음 | WDK는 `Promise<unknown \| null>` 반환. middleware에서 receipt 사용 시 적절한 타입 가드 추가 |
| `@tetherto/wdk-wallet` 버전 드리프트 | 낮음 | 낮음 | pnpm lockfile로 버전 고정. CI에서 `pnpm install --frozen-lockfile` 사용 |

---

## 테스팅 전략

1. **타입 검증**: `npx tsc --noEmit` -- production 코드의 모든 `as any` 제거 후 통과
2. **단위 테스트**: 기존 6개 테스트 파일 전수 통과
   - `factory.test.ts`: MockWalletManager 타입 조정 후 통과
   - `integration.test.ts`: account mock의 기존 cast 패턴 유지
   - `evaluate-policy.test.ts`: 변경 없음
   - `approval-broker.test.ts`: 변경 없음
   - `json-approval-store.test.ts`: 변경 없음
   - `sqlite-approval-store.test.ts`: 변경 없음
3. **수동 검증**: daemon 빌드 (`packages/daemon` typecheck) 통과 확인

---

## 성공 지표

1. `guarded-wdk-factory.ts`에서 `as any` 캐스트 0건
2. 자체 정의 `WalletConfig`, `WalletManager`, `ProtocolEntry` 인터페이스 제거 완료
3. WDK 타입(`typeof WalletManager`, 4개 Protocol class, `MiddlewareFunction`, `IWalletAccountWithProtocols`, `FeeRates`)을 직접 import하여 사용
4. `npx tsc --noEmit` 통과 (cast 없이)
5. 기존 6개 테스트 파일 전수 통과
6. daemon typecheck 통과

---

## 변경되는 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `packages/guarded-wdk/package.json` | 의존성 추가 |
| `packages/guarded-wdk/src/guarded-wdk-factory.ts` | 핵심 리팩토링 |
| `packages/guarded-wdk/src/guarded-middleware.ts` | 타입 호환성 조정 |
| `packages/guarded-wdk/tests/factory.test.ts` | Mock 타입 조정 |
| `pnpm-lock.yaml` | 자동 변경 |

---

## 변경되지 않는 파일 (out of scope)

- `guarded-middleware.ts`의 정책 평가 로직 (evaluatePolicy, matchCondition 등)
- `signed-approval-broker.ts`
- `approval-store.ts` / `json-approval-store.ts` / `sqlite-approval-store.ts`
- `errors.ts`
- `index.ts` (export 변경 없음)
- `packages/daemon/src/wdk-host.ts` (호출 패턴 변경 없음, 타입 호환성만 확인)
- `packages/manifest/`, `packages/relay/`, `packages/app/`
