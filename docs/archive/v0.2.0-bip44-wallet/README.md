# BIP-44 멀티 월렛 아키텍처 - v0.2.0

## 문제 정의

### 현상

1. **니모닉이 여러 개 저장 가능한 구조**: `StoredSeed[]`로 니모닉을 복수 관리하고, `setActiveSeed()`/`getActiveSeed()`로 하나를 선택. BIP-44 표준(1 니모닉 → N 파생 계정)과 불일치.

2. **daemon이 단일 지갑에 고정**: daemon 시작 시 `activeSeed` 하나를 선택하면 런타임 동안 변경 불가. `WDKContext.seedId`가 고정값으로 박힘. AI가 여러 지갑을 운용할 수 없음.

3. **metadata 남용**: `ApprovalRequest.metadata`와 `SignedApproval.metadata`가 `Record<string, unknown>`으로 선언되어, `seedId`와 `signerId` 같은 필수 정보를 `metadata?.seedId as string`으로 캐스트해서 사용. 타입 안전성 없음.

4. **intentId가 불필요한 UUID**: tx의 내용으로부터 결정론적 해시를 만들 수 있는데, 별도로 `intentId`(randomUUID)를 레코드 PK로 사용. 의미 없는 식별자가 중복 존재. 현재 `intentHash`는 timestamp를 포함하지 않아 같은 tx 재실행을 구분하지 못하는 문제도 있음.

5. **AI→사람 메시지 채널 부재**: AI가 승인 요청 시 "왜 이 승인이 필요한지"를 사람에게 전달할 방법이 없음. `metadata`가 이 역할을 해야 했지만 내부 데이터 자루로 사용됨.

### 원인

초기 설계 시 "1 daemon = 1 지갑"을 전제하고, BIP-44 파생 구조를 고려하지 않았음. `StoredSeed`가 니모닉 자체를 복수 저장하는 모델로 설계됨.

### 영향

1. **멀티 지갑 운용 불가**: "A 계정으로 DeFi, B 계정으로 트레이딩" 같은 실전 시나리오를 지원할 수 없음
2. **타입 안전성 구멍**: `metadata` 캐스트로 인한 런타임 에러 가능성
3. **RN App UI 제약**: 승인 화면에서 어떤 지갑에서 나가는 tx인지, AI가 왜 이 요청을 했는지 표시 불가
4. **저널 모델 혼란**: `intentId`(UUID)와 `intentHash`(결정론적)가 공존하며 역할이 불명확

### 목표

1. **니모닉 1개 + BIP-44 파생 계정 N개** 구조로 전환
   - `StoredSeed[]` → `MasterSeed` (1개) + 파생 계정 관리
   - `active` 개념 제거
2. **AI가 `accountIndex`로 지갑을 지정하여 tx 실행** 가능
   - AI는 등록된 계정만 사용 가능 (미등록 인덱스 → 에러)
   - AI는 `listWallets`로 계정 목록 조회 가능
   - 지갑 생성/삭제는 사람의 서명 승인 필요 (Unified SignedApproval)
3. **지갑 생명주기를 Unified SignedApproval로 통합**
   - `ApprovalType`에 `'wallet_create' | 'wallet_delete'` 추가
   - 지갑 생성/삭제도 tx/policy와 동일한 승인 파이프라인
4. **metadata 제거** → `signerId`를 정규 필드로 승격 + AI→사람 메시지용 `content: string` 추가
5. **intentId 제거** → `intentHash`를 PK로 사용
   - `intentHash = SHA-256(chainId + to + data + value + timestamp)` — timestamp 포함으로 같은 tx의 재실행 구분
   - 복합 키나 별도 attempt 엔터티 불필요

### 비목표 (Out of Scope)

- 멀티 체인 계정 파생 (BIP-44 coin_type 분기) — 현재는 단일 coin_type으로 충분
- RN App UI 리디자인 — 기존 레이아웃 유지
- daemon 멀티 프로세스/멀티 세션 구조 — 단일 daemon 인스턴스 유지
- `FailedArg`과 `ArgCondition` 연결 (depth 트레이드오프로 별도 검토)
- `PendingApprovalQueryOpts` 추가 (별도 페이즈)

### Scope 경계 명확화

| 항목 | In/Out | 이유 |
|------|--------|------|
| `StoredSeed` → `MasterSeed` + 파생 계정 | IN | 근본 구조 변경 |
| `ApprovalStore` seed 관련 메서드 재설계 | IN | 위에 딸려옴 |
| `ApprovalType`에 `wallet_create`/`wallet_delete` 추가 | IN | Unified SignedApproval 확장 |
| `WDKContext.seedId` 제거, 호출 시점에 `accountIndex`로 결정 | IN | 멀티 지갑 전제 |
| AI 도구에 `accountIndex` 파라미터 추가 | IN | 위에 딸려옴 |
| `metadata` 제거 → `signerId` 정규 필드 + `content` 추가 | IN | 타입 안전성 |
| `intentId` 제거 → `intentHash`(timestamp 포함) PK 전환 | IN | 불필요 UUID 제거 |
| daemon `execution-journal.ts` 연동 | IN | intentId 제거에 딸려옴 |
| RN App이 `content`, `accountIndex` 필드를 받아 표시 | IN | 현상 5 해결에 필수 |
| RN App UI 리디자인 | OUT | 기존 레이아웃 내 필드 표시만 |
| BIP-44 coin_type 분기 | OUT | 미래 |

### 사용자 확정 결정사항

| 결정 | 내용 | 사유 |
|------|------|------|
| 지갑 식별자 | `accountIndex` (BIP-44 정수) | 표준 준수, AI가 다루기 쉬움, derivation path 비노출 |
| AI 권한 경계 | 등록된 계정만 사용 가능, 생성/삭제 불가 | "AI는 지갑을 사용할 수 있지만, 생성/삭제할 수 없다" |
| 지갑 생성/삭제 승인 | `ApprovalType`에 `wallet_create`/`wallet_delete` 추가 | Unified SignedApproval 모델 확장 |
| 마이그레이션 정책 | 기존 데이터 파기 (clean install) | breaking change 허용, 마이그레이션 복잡도 회피 |
| intentHash PK | `intentHash = SHA-256(chainId + to + data + value + timestamp)` | timestamp 포함으로 단일 PK 충분, 복합 키 불필요 |
| App 최소 연동 | `content`, `accountIndex` 표시는 IN | 현상 5 해결 위해 필수 |
| 정책 범위 | 지갑별 정책 (per accountIndex + chainId) | "DeFi 지갑은 AAVE만, Trading 지갑은 Uniswap만" 시나리오 지원 |
| accountIndex 필수 범위 | tx/sign/transfer/registerCron/putPolicy에 필수, 조회 API는 선택 필터 | 돈이 나가거나 상태를 변경하는 행위에만 필수 |

## 제약사항

- Breaking change 허용 (프로젝트 원칙)
- 기존 로컬 데이터 파기 (clean install) — 마이그레이션 없음
- SQLite 스키마 재설계 (`seeds` → `master_seed` + `wallets`, `execution_journal` PK 변경)
- BIP-44 파생은 기존 `@tetherto/wdk`의 HD wallet 구현을 활용
- 니모닉 저장은 기존과 동일하게 암호화 (SecureStore / 파일 시스템)
