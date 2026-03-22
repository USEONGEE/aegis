# Step 01: installSecureRandom 모듈 생성

## 메타데이터
- **난이도**: 🟡
- **선행 조건**: 없음

## 구현 내용

1. `packages/app/src/core/crypto/installSecureRandom.ts` 생성
   - `requireOptionalNativeModule('ExpoCrypto')`로 native module 직접 접근
   - `fillRandomValues()`로 65536 바이트 chunk 분할 처리
   - `globalThis.crypto.getRandomValues` 설정 (Web Crypto API 호환)
   - `nacl.setPRNG()` 호출하여 tweetnacl에 PRNG 직접 주입
   - 기존 `crypto.getRandomValues`가 있으면 그대로 사용 (중복 설정 방지)
   - ExpoCrypto 없으면 명확한 에러 메시지 throw

2. `packages/app/App.tsx` 수정
   - 첫 번째 import를 `import './src/core/crypto/installSecureRandom'`로 변경
   - 기존 시도한 polyfill 코드 전량 제거

## 완료 조건
- [x] Expo Go에서 `nacl.sign.keyPair()` 정상 동작
- [x] `ExpoCryptoAES` crash 없음
- [x] identity key 생성 + enrollment 진행 가능

## Scope
### 신규 생성
- `packages/app/src/core/crypto/installSecureRandom.ts` — PRNG polyfill + nacl.setPRNG

### 수정 대상
- `packages/app/App.tsx` — 첫 줄 import 변경
