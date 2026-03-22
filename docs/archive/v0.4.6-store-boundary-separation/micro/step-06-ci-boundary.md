# Step 06: CI 경계 체크 + 런타임 DB 분리

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: Step 05 (facade 전환 완료)

---

## 1. 구현 내용 (design.md 섹션 6, 7-Step6)

- `scripts/check/checks/daemon/no-direct-wdk-store.ts` 생성: WdkStore/SqliteWdkStore/JsonWdkStore import 금지 + getApprovalStore/getApprovalBroker 호출 금지 (allow 모드로 wdk-host.ts 예외)
- `scripts/check/registry.ts`에 등록
- daemon DB 경로 분리: `config.storePath` (기존, WDK용 wdk.db) + `config.daemonStorePath` (신규, daemon.db) — 기존 설정명 유지
- `packages/daemon/src/config.ts`에 `daemonStorePath` 필드 추가

## 2. 완료 조건
- [ ] CI `daemon/no-direct-wdk-store-access` 체크 PASS
- [ ] wdk-host.ts의 SqliteWdkStore import은 CI 통과 (allow 예외)
- [ ] 2개 SQLite 파일이 서로 다른 경로에 생성됨 확인
- [ ] `npm run check` 실행 시 새로운 FAIL 없음 (기존 FAIL 외)
- [ ] DoD: N2, N3, N4, N5

## 3. 롤백 방법
- CI 체크 파일 삭제 + registry 등록 해제

---

## Scope

### 수정 대상 파일
```
scripts/check/
├── registry.ts                # 새 체크 등록

packages/daemon/src/
├── config.ts                  # daemonStorePath 필드 추가 (기존 storePath 유지)
├── index.ts                   # config.daemonStorePath 사용하여 SqliteDaemonStore 생성
└── wdk-host.ts                # config.storePath 사용 (기존 유지, 변경 없음)
```

### 신규 생성 파일
```
scripts/check/checks/daemon/
└── no-direct-wdk-store.ts     # 신규 CI 체크
```

### Side Effect 위험
- 낮음 — CI 체크 추가 + config 확장

---

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| 모든 항목 | 구현 내용과 1:1 매핑 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| daemonStorePath config | ✅ config.ts 추가됨 | OK |
| DB 경로 분리 | ✅ index.ts, wdk-host.ts | OK |
| CI 체크 PASS | ✅ positive proof | OK |

### 검증 통과: ✅

---

→ 다음: [Step 07: 정리 + 테스트 보강](step-07-cleanup.md)
