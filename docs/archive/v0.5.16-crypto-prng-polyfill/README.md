# Crypto PRNG Polyfill — v0.5.16

## 문제 정의

### 현상
- Expo Go (SDK 54, iOS)에서 `tweetnacl`의 `nacl.sign.keyPair()` 호출 시 `"no PRNG"` 에러 발생.
- Identity key 생성이 불가하여 device pairing, approval 서명 전체가 동작 불가.

### 원인
- React Native에는 `crypto.getRandomValues()`가 기본 제공되지 않음.
- `tweetnacl`은 내부적으로 `crypto.getRandomValues`를 찾고, 없으면 `"no PRNG"` throw.
- Expo Go는 native rebuild 없이 동작하므로, native module 의존 polyfill이 제한적.

### 목표
- Expo Go 환경에서 `tweetnacl`이 정상 동작하도록 PRNG polyfill 제공.
- native rebuild 없이 해결.

### 비목표
- tweetnacl → noble/ed25519 라이브러리 교체 (별도 페이즈)
- 프로덕션 보안 감사

### 제약사항
- Expo Go에서 실행 (native rebuild 불가)
- `expo-crypto` 패키지의 `import *`는 `ExpoCryptoAES` native module을 로드하여 crash → 직접 import 불가
