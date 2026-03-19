# Step 35: app - E2E 암호화 + PairingService

## 메타데이터
- **난이도**: 🔴 어려움
- **롤백 가능**: ✅
- **선행 조건**: Step 34 (IdentityKeyManager)

---

## 1. 구현 내용 (design.md + PRD 기반)

E2E 암호화 모듈 + PairingService (QR 코드 + SAS 검증).

**E2ECrypto** (`src/core/relay/E2ECrypto.ts`):
- ECDH 키 교환 (X25519): tweetnacl-box
- 세션 키 파생: ECDH shared secret → HKDF 또는 직접 사용
- encrypt/decrypt: tweetnacl secretbox (XSalsa20-Poly1305)
- Relay는 payload 복호화 불가 (blind transport)

**PairingService** (`src/core/relay/PairingService.ts`):
- QR 코드 생성: 앱의 ephemeral X25519 public key + Relay URL + pairing code
- QR 스캔 (daemon 측): daemon이 자신의 ephemeral key로 ECDH → shared secret
- SAS (Short Authentication String) 검증: shared secret의 첫 6자리 → 양쪽 화면에 표시 → 사용자가 육안 확인
- MITM 탐지: SAS 불일치 시 pairing 중단
- pairing 완료 시: identity key의 public key를 daemon에 전달 → trustedApprovers 등록

**Pairing 흐름**:
1. 앱: ephemeral X25519 키 생성 → QR 렌더
2. daemon: QR 스캔 → ephemeral key 추출 → ECDH → shared secret 계산
3. daemon: 자신의 ephemeral public key를 Relay 경유로 앱에 전달
4. 앱: ECDH → shared secret 계산
5. 양쪽: SAS 표시 → 사용자 확인
6. 앱: identity public key를 암호화해서 daemon에 전달
7. daemon: trustedApprovers에 등록 + devices 테이블 저장

## 2. 완료 조건
- [ ] `src/core/relay/E2ECrypto.ts` 생성
- [ ] `generateEphemeralKeyPair()` → X25519 키페어 생성
- [ ] `deriveSharedSecret(mySecretKey, theirPublicKey)` → ECDH shared secret
- [ ] `encrypt(plaintext, sharedSecret)` → nonce + ciphertext (secretbox)
- [ ] `decrypt(ciphertext, nonce, sharedSecret)` → plaintext
- [ ] `src/core/relay/PairingService.ts` 생성
- [ ] `generateQRPayload()` → QR 데이터 (ephemeral pubkey + relay URL + pairing code)
- [ ] `computeSAS(sharedSecret)` → 6자리 숫자 문자열
- [ ] `completePairing(daemonEphemeralPubKey)` → ECDH + SAS 계산 + identity key 전달 준비
- [ ] SAS 불일치 시 pairing 중단 (에러 throw)
- [ ] pairing 완료 시 identity public key를 암호화하여 전달
- [ ] tweetnacl (box + secretbox) 사용
- [ ] 단위 테스트: 양쪽 키 생성 → ECDH → 동일 shared secret → encrypt/decrypt → SAS 일치
- [ ] 단위 테스트: 다른 키로 ECDH → SAS 불일치 → pairing 실패

## 3. 롤백 방법
- `src/core/relay/E2ECrypto.ts`, `src/core/relay/PairingService.ts` 삭제

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/core/relay/
    E2ECrypto.ts                   # ECDH + encrypt/decrypt
    PairingService.ts              # QR + SAS pairing
  tests/
    e2e-crypto.test.ts             # E2E 암호화 단위 테스트
    pairing-service.test.ts        # PairingService 단위 테스트
```

### 수정 대상 파일
```
packages/app/package.json          # tweetnacl 이미 추가됨 (Step 34), react-native-qrcode-svg 추가
```

### Side Effect 위험
- 없음 (신규 모듈)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| E2ECrypto.ts | ECDH + secretbox | ✅ OK |
| PairingService.ts | QR + SAS | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| ECDH 키 교환 | ✅ E2ECrypto.ts | OK |
| encrypt/decrypt | ✅ E2ECrypto.ts | OK |
| QR payload 생성 | ✅ PairingService.ts | OK |
| SAS 계산/검증 | ✅ PairingService.ts | OK |
| MITM 탐지 | ✅ PairingService.ts | OK |
| identity key 전달 | ✅ PairingService.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 36: app - RelayClient](step-36-relay-client.md)
