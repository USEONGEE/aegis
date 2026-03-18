# WDK 지갑 추상화 평가 — 애플리케이션 레이어 표준으로서의 적합성

> WDK의 지갑 인터페이스를 앱 레이어 지갑 표준으로 채택할 때의 가능성과 미결 사항 정리

---

## 개요

`@tetherto/wdk`(Wallet Development Kit)의 지갑 추상화를 애플리케이션 레이어의 **지갑 인터페이스 표준**으로 채택하는 전략을 검토한다. 목적은 WDK 지갑뿐 아니라 Trust Wallet Core 등 다른 지갑 구현체도 동일한 인터페이스로 래핑하여 **교체 가능하게** 만드는 것이다.

DeFi 프로토콜(swap, bridge, lending, fiat)은 사용하지 않는다. 지갑 추상화만 대상으로 한다.

## 채택할 추상화 표면

### WalletManager (지갑 관리자)

| 메서드 | 시그니처 | 설명 |
|--------|----------|------|
| `getAccount` | `(index?: number) → Promise<IWalletAccount>` | BIP-44 인덱스로 계정 파생 |
| `getAccountByPath` | `(path: string) → Promise<IWalletAccount>` | BIP-44 경로로 계정 파생 |
| `getFeeRates` | `() → Promise<{normal: bigint, fast: bigint}>` | 현재 수수료율 조회 |
| `dispose` | `() → void` | 모든 계정 정리, 키 메모리 삭제 |

### IWalletAccount (지갑 계정)

| 메서드/속성 | 시그니처 | 설명 |
|------------|----------|------|
| `index` | `number` (getter) | 파생 경로 인덱스 |
| `path` | `string` (getter) | 파생 경로 |
| `getAddress` | `() → Promise<string>` | 주소 조회 |
| `getBalance` | `() → Promise<bigint>` | 네이티브 토큰 잔액 |
| `getTokenBalance` | `(tokenAddress: string) → Promise<bigint>` | 특정 토큰 잔액 |
| `sign` | `(message: string) → Promise<string>` | 메시지 서명 |
| `verify` | `(message: string, signature: string) → Promise<boolean>` | 서명 검증 |
| `sendTransaction` | `(tx: Transaction) → Promise<TransactionResult>` | 트랜잭션 전송 |
| `transfer` | `(options: TransferOptions) → Promise<TransferResult>` | 토큰 전송 |
| `quoteSendTransaction` | `(tx: Transaction) → Promise<{fee: bigint}>` | 트랜잭션 수수료 견적 |
| `quoteTransfer` | `(options: TransferOptions) → Promise<{fee: bigint}>` | 전송 수수료 견적 |
| `getTransactionReceipt` | `(hash: string) → Promise<unknown \| null>` | 트랜잭션 영수증 조회 |
| `toReadOnlyAccount` | `() → Promise<IWalletAccountReadOnly>` | 읽기전용 계정 반환 |
| `dispose` | `() → void` | 계정 정리, 키 메모리 삭제 |

### 공유 타입

```typescript
Transaction = { to: string, value: number | bigint }
TransactionResult = { hash: string, fee: bigint }
TransferOptions = { token: string, recipient: string, amount: number | bigint }
TransferResult = { hash: string, fee: bigint }
FeeRates = { normal: bigint, fast: bigint }
```

## 의도적으로 제거한 것

| 항목 | 이유 |
|------|------|
| `keyPair` getter | raw 키 노출은 보안 모델을 구현체에 강제함. 키 관리는 각 구현체 내부 책임. `sign`/`verify`만 외부에 노출하면 충분 |
| 프로토콜 전체 (swap, bridge, lending, fiat) | 앱 레이어에서 사용 안 함 |

## 미결 사항 (Open Questions)

### 1. `Transaction` 타입이 너무 단순함

**현재**: `{ to: string, value: number | bigint }` — 네이티브 토큰 단순 전송만 커버

**부족한 부분**:
- EVM `data` 필드 (스마트 컨트랙트 호출)
- Bitcoin UTXO 모델
- TON memo/payload
- Solana instructions

**선택지**:
- (A) `Transaction`에 `data?: unknown` 같은 확장 필드 추가
- (B) 컨트랙트 호출은 추상화 범위 밖으로 두고, 체인별 구현체에서 별도 메서드 제공
- (C) 현재 상태 유지 — 단순 송금만 표준화, 나머지는 구현체 직접 접근

**미결정**

### 2. `getTransactionReceipt` 리턴 타입이 `unknown`

**현재**: `Promise<unknown | null>` — 체인마다 receipt 구조가 달라서 타입 없음

**문제**: 앱 레이어에서 receipt를 사용하려면 결국 체인별 분기 필요

**선택지**:
- (A) 공통 receipt 타입 정의 (`{ hash, status, blockNumber, ... }`)하고 체인별 차이는 `extra?: unknown`으로
- (B) 제네릭으로 `getTransactionReceipt<T>(hash) → Promise<T | null>`
- (C) 현재 상태 유지 — receipt 파싱은 앱 레이어 책임

**미결정**

### 3. 누락된 기능 — 필요 여부 판단 필요

| 기능 | 설명 | 현재 상태 |
|------|------|----------|
| 트랜잭션 히스토리 | 과거 트랜잭션 목록 조회 | 없음 |
| 토큰 목록/메타데이터 | 지원 토큰 조회, 심볼/소수점 등 | 없음 |
| 이벤트/구독 | 잔액 변경, 트랜잭션 확인 등 실시간 알림 | 없음 |
| 네트워크 정보 | 체인 ID, RPC URL 등 | 없음 |

**미결정** — 앱 요구사항에 따라 추가 여부 판단

## 결론

WDK 지갑 추상화는 **핵심 지갑 기능(계정 파생, 잔액, 서명, 송금, 수수료)을 깔끔하게 커버**하고 있어 앱 레이어 표준으로 채택 가능하다. `keyPair` 제거 후 인터페이스는 구현체 중립적이며, 어댑터 패턴으로 다른 지갑 코어를 래핑할 수 있다.

미결 사항 3개(Transaction 타입 확장, receipt 타입, 추가 기능)는 실제 앱 요구사항이 구체화되면 결정하면 된다.

---

**작성일**: 2026-03-12 KST
