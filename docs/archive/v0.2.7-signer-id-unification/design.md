# 설계 - v0.2.7

## 변경 규모
**규모**: 운영 리스크
**근거**: 3개+ 패키지(guarded-wdk, daemon, app) 수정, 내부 API(SignedApproval, ApprovalStore) 변경, DB 스키마 변경(signers, nonces 테이블), app-daemon wire contract 동시 변경, clean install 필수.

---

## 문제 요약
`SignedApproval`에 `approver`(공개키)와 `signerId`가 별도 존재. signer마다 고유 키쌍이므로 publicKey가 유일한 식별자. 중복 제거.

> 상세: [README.md](README.md) 참조

## 접근법
`signerId` 필드를 모든 타입/store/verifier/app에서 제거. `approver`(publicKey)가 유일한 signer 식별자.

## 대안 검토

| 방식 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A: signerId 제거, approver로 통합 | 중복 제거, 단일 식별자 | 전 패키지 breaking change | ✅ |
| B: signerId를 publicKey alias로 유지 | 호환성 | 중복 유지, 혼란 지속 | ❌ |

## 기술 결정

| 결정 | 내용 | 근거 |
|------|------|------|
| SignedApproval.signerId | 제거 | approver가 동일 역할 |
| StoredSigner PK | publicKey | signerId 필드 삭제 |
| HistoryEntry.signerId | 제거 | approver 필드로 통합 |
| nonce 키 | approver 단일키 | 복합키 불필요 |
| isSignerRevoked | `isSignerRevoked(publicKey)` | 파라미터명만 변경 |
| device_revoke targetHash | SHA-256(폐기 대상 signer의 publicKey) | 승인자가 아니라 폐기 대상의 publicKey를 해시 |
| App SignedApprovalBuilder | signerId 필드 제거, approver만 사용 | App도 동시 정리 |
| name fallback | null이면 `pk[:8]...pk[-4:]` 축약 표시 | 기존 name 필드 활용 |
| 데이터 호환 | clean install | signers/nonces 스키마 변경 |

---

## 범위 / 비범위

- **범위**: guarded-wdk(approval-store, verifier, broker, middleware, store 구현체, store-types, index), daemon(control-handler, admin-server), app(SignedApprovalBuilder, types, PairingService, SettingsScreen), 관련 테스트
- **비범위**: relay 패키지

## 아키텍처 개요

변경 전:
```
SignedApproval: { approver(pubkey), signerId(별도ID), ... }
StoredSigner: { signerId(PK), publicKey, name, ... }
nonce: (approver, signerId) 복합키
verifier: approver로 서명검증, signerId로 폐기체크
```

변경 후:
```
SignedApproval: { approver(pubkey), ... }  ← signerId 제거
StoredSigner: { publicKey(PK), name, ... } ← signerId 제거
nonce: (approver) 단일키
verifier: approver로 서명검증 + 폐기체크 (동일 키)
```

## API/인터페이스 계약

| 변경 전 | 변경 후 |
|---------|---------|
| `SignedApproval.signerId: string` | 삭제 |
| `HistoryEntry.signerId: string` | 삭제 |
| `StoredSigner.signerId: string` | 삭제, `publicKey`가 PK |
| `ApprovalStore.saveSigner(signerId, publicKey)` | `saveSigner(publicKey, name?)` |
| `ApprovalStore.getSigner(signerId)` | `getSigner(publicKey)` |
| `ApprovalStore.revokeSigner(signerId)` | `revokeSigner(publicKey)` |
| `ApprovalStore.isSignerRevoked(signerId)` | `isSignerRevoked(publicKey)` |
| `ApprovalStore.getLastNonce(approver, signerId)` | `getLastNonce(approver)` |
| `ApprovalStore.updateNonce(approver, signerId, nonce)` | `updateNonce(approver, nonce)` |
| App `SignedApprovalBuilder.signerId` | 삭제 |
| App `SignedApprovalPayload.signerId` | 삭제 |

## 데이터 모델/스키마

signers 테이블:
```sql
-- 변경 전
CREATE TABLE signers (signer_id TEXT PK, public_key TEXT, name TEXT, registered_at INTEGER, revoked_at INTEGER)
-- 변경 후
CREATE TABLE signers (public_key TEXT PK, name TEXT, registered_at INTEGER, revoked_at INTEGER)
```

nonces 테이블:
```sql
-- 변경 전
CREATE TABLE nonces (approver TEXT, signer_id TEXT, nonce INTEGER, PRIMARY KEY (approver, signer_id))
-- 변경 후
CREATE TABLE nonces (approver TEXT PRIMARY KEY, nonce INTEGER)
```

## 테스팅 전략

1. guarded-wdk: approval-broker.test.ts, json/sqlite-approval-store.test.ts, factory.test.ts, integration.test.ts — signerId 참조 전부 제거
2. daemon: control-handler.test.ts — pairing/revoke에서 signerId→publicKey
3. app: SignedApprovalBuilder 관련 테스트 (있다면)

## 데이터 흐름

N/A: 외부 시스템 연동 변경 없음. 기존 pairing/revoke 흐름의 필드명만 변경.

## 리스크/오픈 이슈

- App과 daemon wire contract 동시 변경 필수 — 한쪽만 배포하면 pairing/revoke 실패. clean install + 동시 배포로 완화.
- 기존 signer 데이터 손실 — clean install 전제. 기존 페어링은 재수행 필요.

## 실패/에러 처리

N/A: signerId→publicKey 필드 이름 변경. 새 에러 경로 없음.

## 롤아웃/롤백 계획

- **롤아웃**: clean install. signers/nonces 테이블 재생성.
- **롤백**: `git revert`. clean install 환경이므로 마이그레이션 불필요.

## 관측성

N/A: 로컬 CLI 도구.

## 보안/권한

N/A: 서명 검증 로직 변경 없음. 키 기반 식별로 보안 수준 동일.

## 성능/스케일

N/A: 필드 제거로 약간의 저장소 크기 감소.

## 가정/제약

- clean install 필수
- App과 daemon이 동시에 배포되는 전제 (wire contract 동시 변경)

---

## Step-by-step 구현 계획

### Step 1: 타입 변경
- `SignedApproval.signerId` 제거
- `HistoryEntry.signerId` 제거
- `StoredSigner.signerId` 제거
- `ApprovalStore` 메서드 시그니처 변경 (saveSigner, getSigner, revokeSigner, isSignerRevoked, getLastNonce, updateNonce)
- `store-types.ts` SignerRow 변경, NonceRow 변경

### Step 2: Verifier + Broker 변경
- approval-verifier: signerId 참조 → approver로 변경 (폐기체크, nonce)
- signed-approval-broker: device_revoke에서 폐기 대상 식별 방식 변경:
  - 기존: `signedApproval.signerId` → `revokeSigner(signerId)`
  - 변경: `signedApproval.targetHash` → store의 signer 목록을 순회하여 `SHA-256(publicKey) === targetHash`인 signer를 찾아 `revokeSigner(publicKey)` 호출
  - 이 방식은 signerId 없이도 폐기 대상을 정확히 식별 가능 (targetHash가 검증된 서명에 포함되므로 변조 불가)

### Step 3: Store 구현체 변경
- json-approval-store: signers 저장/조회 키 변경, nonces 키 변경, history signerId 제거
- sqlite-approval-store: 동일 + CREATE TABLE 변경

### Step 4: Daemon 변경
- control-handler: pairing_confirm에서 signerId → publicKey(identityPubKey), device_revoke에서 SHA-256(폐기 대상 signer의 publicKey)
- admin-server: signer 목록에서 signerId → publicKey

### Step 5: App 변경
- SignedApprovalBuilder: signerId 필드/setter 제거
- types.ts: SignedApprovalPayload.signerId 제거
- PairingService: signerId → publicKey
- SettingsScreen: signerId 참조 → publicKey, fallback 축약 표시

### Step 6: 테스트

---

## 변경 대상 파일 요약

| 파일 | 변경 |
|------|------|
| `guarded-wdk/src/approval-store.ts` | SignedApproval, HistoryEntry, StoredSigner, 메서드 시그니처 |
| `guarded-wdk/src/approval-verifier.ts` | signerId → approver |
| `guarded-wdk/src/signed-approval-broker.ts` | signerId → approver |
| `guarded-wdk/src/errors.ts` | SignerRevokedError 파라미터 |
| `guarded-wdk/src/json-approval-store.ts` | signers/nonces/history |
| `guarded-wdk/src/sqlite-approval-store.ts` | signers/nonces/history + DDL |
| `guarded-wdk/src/store-types.ts` | SignerRow, NonceRow |
| `guarded-wdk/src/index.ts` | export 정리 |
| `daemon/src/control-handler.ts` | pairing/revoke |
| `daemon/src/admin-server.ts` | signer 목록 |
| `app/src/core/approval/SignedApprovalBuilder.ts` | signerId 제거 |
| `app/src/core/approval/types.ts` | signerId 제거 |
| `app/src/core/crypto/PairingService.ts` | signerId → publicKey |
| `app/src/domains/settings/screens/SettingsScreen.tsx` | signerId → publicKey |
| 테스트 7+ 파일 | signerId 참조 전부 제거 |
