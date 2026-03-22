# DoD — v0.5.16

## 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| 1 | `nacl.sign.keyPair()` 호출 시 "no PRNG" 에러 없음 | Expo Go에서 identity key 생성 성공 |
| 2 | `installSecureRandom.ts`가 App.tsx 최상단에서 import됨 | App.tsx 첫 줄 확인 |
| 3 | `expo-crypto` 패키지 index.ts를 import하지 않음 | `requireOptionalNativeModule`으로 직접 접근 확인 |
| 4 | `ExpoCryptoAES` native module crash 없음 | Expo Go 앱 정상 기동 |
| 5 | `globalThis.crypto.getRandomValues` 사용 가능 | 다른 라이브러리도 Web Crypto API 사용 가능 |

## 기본 검증
- [x] Expo Go에서 앱 기동 성공
- [x] identity key 생성 → enrollment 진행 가능
