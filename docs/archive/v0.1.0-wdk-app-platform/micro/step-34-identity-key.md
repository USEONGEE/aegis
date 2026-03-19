# Step 34: app - IdentityKeyManager (Expo SecureStore)

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 33

---

## 1. 구현 내용 (design.md + PRD 기반)

IdentityKeyManager — Ed25519 키페어를 Expo SecureStore에 안전하게 저장/관리.

- `src/core/identity/IdentityKeyManager.ts`: generate, load, delete, getPublicKey, sign
- Expo SecureStore (iOS Keychain / Android Keystore) 사용
- Ed25519 키페어: tweetnacl (`nacl.sign.keyPair()`)
- 키 저장: SecureStore에 secret key (64 bytes) Base64 인코딩 저장
- public key는 secret key에서 파생 (별도 저장 불필요)

**Identity Key는 보안 루트** — SignedApproval의 서명에 사용. AI/daemon/Relay 모두 접근 불가. OS Keychain 수준 보호.

```typescript
interface IdentityKeyManager {
  generate(): Promise<{ publicKey: Uint8Array }>
  load(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null>
  delete(): Promise<void>
  getPublicKey(): Promise<Uint8Array | null>
  sign(message: Uint8Array): Promise<Uint8Array>
  hasKey(): Promise<boolean>
}
```

## 2. 완료 조건
- [ ] `src/core/identity/IdentityKeyManager.ts` 생성
- [ ] `generate()` → Ed25519 키페어 생성 → SecureStore에 저장 → publicKey 반환
- [ ] `load()` → SecureStore에서 secretKey 로드 → 키페어 반환 (없으면 null)
- [ ] `delete()` → SecureStore에서 키 삭제
- [ ] `getPublicKey()` → secretKey 로드 → publicKey 파생 반환 (없으면 null)
- [ ] `sign(message)` → secretKey로 Ed25519 서명 → signature 반환
- [ ] `hasKey()` → SecureStore에 키 존재 여부 boolean 반환
- [ ] SecureStore 키 이름: `wdk_identity_secret_key`
- [ ] tweetnacl 의존성 추가
- [ ] expo-secure-store 의존성 추가
- [ ] 단위 테스트: generate → load → sign → verify → delete 사이클 (SecureStore mock)

## 3. 롤백 방법
- `src/core/identity/` 디렉토리 삭제
- package.json에서 tweetnacl, expo-secure-store 의존성 제거

---

## Scope

### 신규 생성 파일
```
packages/app/
  src/core/identity/
    IdentityKeyManager.ts          # SecureStore CRUD + Ed25519
  tests/
    identity-key-manager.test.ts   # 단위 테스트 (SecureStore mock)
```

### 수정 대상 파일
```
packages/app/package.json          # tweetnacl, expo-secure-store 의존성 추가
```

### Side Effect 위험
- 없음 (신규 모듈)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| IdentityKeyManager.ts | SecureStore + Ed25519 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| generate/load/delete | ✅ IdentityKeyManager.ts | OK |
| getPublicKey/sign | ✅ IdentityKeyManager.ts | OK |
| SecureStore 저장 | ✅ IdentityKeyManager.ts | OK |
| Ed25519 (tweetnacl) | ✅ IdentityKeyManager.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 35: app - E2E Pairing](step-35-e2e-pairing.md)
