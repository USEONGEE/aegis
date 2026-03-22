# Step 03: ListItem Pick 파생 + 최종 통합 검증

## 메타데이터
- **난이도**: 🟡 보통 (Pick 파생 + Phase 최종 검증 포함)
- **롤백 가능**: ✅ (Pick → 독립 interface 복원)
- **선행 조건**: Step 02 완료 (Record가 최종 shape여야 Pick 대상으로 적절)

---

## 1. 구현 내용 (design.md Step C)

1. `DeviceListItem` 변경:
   ```ts
   // Before
   export interface DeviceListItem { id: string; type: string; pushToken: string | null; lastSeenAt: Date | null }
   // After
   export type DeviceListItem = Pick<DeviceRecord, 'id' | 'type' | 'pushToken' | 'lastSeenAt'>
   ```
2. `SessionListItem` 변경:
   ```ts
   // Before
   export interface SessionListItem { id: string; metadata: Record<string, unknown> | null; createdAt: Date }
   // After
   export type SessionListItem = Pick<SessionRecord, 'id' | 'metadata' | 'createdAt'>
   ```

## 2. 완료 조건
- [x] F6: DeviceListItem이 `Pick<DeviceRecord, ...>`
- [x] F7: SessionListItem이 `Pick<SessionRecord, ...>`
- [x] F8: DeviceListItem.type이 DeviceType (Pick이 DeviceType을 전파)
- [x] N1: tsc 새 에러 0건
- [x] N2: 새 테스트 실패 0건 (기존 baseline 실패만 존재)
- [x] N3: dead-exports 체크에서 DeviceType/SubjectRole dead 아님
- [x] N4: 변경이 타입 정의/import에 국한됨 확인
- [x] N5: schema.sql 변경 없음
- [x] E3: ws.ts device.type === 'app' 비교 호환 (tsc 통과)
- [x] E4: auth.ts JSON schema enum 1건 유지 확인

## 3. 롤백 방법
- `git checkout -- packages/relay/src/registry/registry-adapter.ts`

---

## Scope

### 수정 대상 파일
```
packages/relay/src/
└── registry/registry-adapter.ts  # 수정 — DeviceListItem, SessionListItem을 Pick 파생으로 변경
```

### 간접 검증 대상 (코드 수정 없음, 검증만)
```
packages/relay/src/
├── routes/auth.ts               # E4: Fastify JSON schema enum 유지 확인
├── routes/ws.ts                 # E3: device.type === 'app' 비교 호환 확인
└── registry/pg-registry.ts      # 소비자 호환 확인
```

### Repo-level validation (최종 통합 검증)
- `npx tsc --noEmit -p packages/relay/tsconfig.json` (N1)
- `npm test --workspace=packages/relay` (N2)
- `npx tsx scripts/check/index.ts --check=cross/dead-exports` (N3)
- `git diff` 코드 리뷰 (N4, N5)

### Side Effect 위험
- **DeviceListItem.type 좁힘**: `string` → `DeviceType`. 이는 의도된 변경이며 tsc가 검증. 소비자(pg-registry getDevicesByUser, ws.ts pushToOfflineApps)는 `'app'`/`'daemon'` 리터럴과 비교하므로 호환.

### 참고할 기존 패턴
- 없음 (relay에 기존 Pick 파생 패턴 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| registry-adapter.ts | F6, F7, F8 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| DeviceListItem Pick | ✅ registry-adapter.ts | OK |
| SessionListItem Pick | ✅ registry-adapter.ts | OK |
| E4 auth.ts enum 검증 | ✅ 간접 검증 대상 | OK |
| E3 ws.ts 비교 호환 | ✅ 간접 검증 대상 | OK |
| N2/N3/N4/N5 통합 검증 | ✅ Repo-level validation | OK |
| pg-registry.ts 소비자 | pg-registry의 SQL 결과 반환이므로 코드 수정 불필요 | OK — 간접 검증 |

### 검증 통과: ✅
