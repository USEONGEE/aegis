# signerId === publicKey 통합 — v0.2.7

## 문제 정의

### 현상

1. **signerId와 approver(publicKey) 중복**: `SignedApproval`에 `approver: string`(Ed25519 공개키)과 `signerId: string`(서명자 ID)이 별도 필드로 존재. 실제로 signer마다 고유한 키쌍을 가지므로 `signerId === publicKey`가 자연스러운데, 두 필드가 분리되어 있음.

2. **StoredSigner에 불필요한 이중 식별**: `{ signerId, publicKey, ... }` — signerId가 publicKey와 1:1 관계이므로 publicKey 자체가 PK로 충분.

3. **nonce가 approver+signerId 쌍으로 관리**: `getLastNonce(approver, signerId)`. signerId === publicKey라면 하나의 키로 충분.

### 원인

초기 설계에서 "한 사람이 여러 디바이스, 디바이스마다 별도 ID"를 상정했으나, 실제 구현은 디바이스마다 고유 키쌍을 생성하므로 공개키 자체가 고유 식별자.

### 영향

1. `SignedApproval`에 `approver`와 `signerId` 두 필드가 있어 "어떤 게 진짜 식별자인가" 혼란
2. `StoredSigner`의 `signerId`와 `publicKey`가 별도 컬럼으로 중복 저장
3. nonce 테이블이 approver+signerId 복합키 — 단일 키로 충분
4. approval-verifier에서 `approver`로 서명 검증, `signerId`로 폐기 체크 — 같은 값인데 다른 이름으로 조회

### 목표

1. `SignedApproval`에서 `signerId` 제거 → `approver`(publicKey)가 유일한 서명자 식별자
2. `StoredSigner`에서 `signerId` 제거 → `publicKey`가 PK
3. nonce를 `approver` 단일 키로 관리
4. approval-verifier의 폐기 체크를 `approver`(publicKey)로 수행
5. `HistoryEntry.signerId` 제거 → `approver`로 통합

### 비목표 (Out of Scope)

- relay 패키지 변경
- daemon control-handler의 pairing 흐름 전체 재설계 (pairing에서 signerId→publicKey 매핑만 변경)

### Scope 경계 명확화

| 항목 | In/Out | 이유 |
|------|--------|------|
| `SignedApproval.signerId` 제거 | IN | approver로 통합 |
| `StoredSigner` 구조 변경: signerId 제거, publicKey가 PK | IN | 중복 제거 |
| `HistoryEntry.signerId` 제거 | IN | approver로 통합 |
| nonce: `(approver, signerId)` → `(approver)` 단일키 | IN | signerId === approver |
| approval-verifier: signerId 참조 → approver 참조 | IN | 핵심 변경 |
| signed-approval-broker: signerId 참조 정리 | IN | verifier에 딸려옴 |
| store 구현체 (Json/Sqlite): signers 테이블/파일 스키마 변경 | IN | StoredSigner 변경에 딸려옴 |
| store-types.ts: SignerRow 변경 | IN | 위에 딸려옴 |
| daemon control-handler: pairing_confirm에서 signerId→publicKey | IN | 경계 정리 |
| daemon tool-surface: signerId 참조 정리 | IN | 있다면 정리 |
| RN App SignedApprovalBuilder: signerId 제거 | IN | App도 동시에 정리 |
| RN App PairingService: signerId → publicKey | IN | 페어링 흐름 통일 |
| RN App SettingsScreen: signer 목록에서 signerId → publicKey | IN | UI 표시는 name 사용, 내부 식별자만 변경 |
| device_revoke targetHash 계산: SHA-256(signerId) → SHA-256(publicKey) | IN | 식별 기준 변경 |

### 사용자 확정 결정사항

| 결정 | 내용 | 사유 |
|------|------|------|
| 식별자 통합 | signerId 제거, publicKey(approver)가 유일한 식별자 | signer마다 고유 키쌍이므로 publicKey 자체가 고유 |
| StoredSigner PK | publicKey | signerId와 1:1이므로 중복 |
| nonce 키 | approver 단일키 | signerId === approver |
| App 범위 | 포함 (guarded-wdk + daemon + app) | 한번에 깨끗하게 정리 |
| UX 식별자 | publicKey (내부), name (UI 표시) | StoredSigner.name은 nullable 유지. UI에서 name이 null이면 축약된 publicKey(`pk[:8]...pk[-4:]`)로 fallback 표시. pairing 시 name 수집은 이번 scope 아님 — 기존대로 null. |

## 제약사항

- Breaking change 허용
- clean install (signers 테이블/nonces 테이블 스키마 변경)
- guarded-wdk + daemon + app 범위
