# 설계 — v0.5.16

## 접근법

`expo-modules-core`의 `requireOptionalNativeModule('ExpoCrypto')`로 ExpoCrypto native module에 직접 접근하여 `getRandomValues`만 추출. 이 방식은 `expo-crypto` 패키지의 index.ts를 거치지 않으므로 `ExpoCryptoAES` 모듈 로드를 우회한다.

추출한 `getRandomValues`를 두 곳에 설정:
1. `globalThis.crypto.getRandomValues` — Web Crypto API 호환
2. `nacl.setPRNG()` — tweetnacl 전용 PRNG 직접 주입

### 핵심 기술 결정

1. **`requireOptionalNativeModule`** — Expo Go에 번들된 ExpoCrypto module을 직접 로드. `expo-crypto` 패키지 import 없이 native module만 접근.

2. **`nacl.setPRNG()`** — tweetnacl이 제공하는 커스텀 PRNG 설정 API. `crypto.getRandomValues` 폴백 탐색을 우회하여 확실하게 PRNG를 주입.

3. **side-effect module (`installSecureRandom.ts`)** — App.tsx 최상단 import로 모든 코드보다 먼저 실행. 모듈 로드 시점에 `installSecureRandom()` 자동 호출.

4. **chunk 분할 (65536 bytes)** — Web Crypto API의 `getRandomValues` 한 번에 최대 65536 바이트 제한 준수. 큰 버퍼를 chunk 단위로 분할 처리.

## 버린 대안

| 시도 | 실패 이유 |
|------|----------|
| `import { getRandomValues } from 'expo-crypto'` | `export * from './aes'`가 ExpoCryptoAES 로드 → native module 없어 crash |
| `import 'react-native-get-random-values'` | `RNGetRandomValues` TurboModule이 Expo Go에 없음 |
| `global.expo?.modules?.ExpoCrypto` 접근 | SDK 54에서 이 경로에 모듈이 노출되지 않음 (undefined) |
| `Math.random` fallback | 보안상 부적합 (서명 키 생성에 사용 불가) |
| `expo-crypto/build/Crypto` 직접 import | 내부에서 `export * from './aes'` 포함 → 동일 crash |
