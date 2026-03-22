# Step 01: actor-types.ts 신설 + 리터럴 alias 추출

## 메타데이터
- **난이도**: 🟢 쉬움
- **롤백 가능**: ✅ (신규 파일 삭제 + alias 치환 복원)
- **선행 조건**: 없음

---

## 1. 구현 내용 (design.md Step A)

1. `packages/relay/src/registry/actor-types.ts` 신설
   - `export type DeviceType = 'daemon' | 'app'`
   - `export type SubjectRole = 'daemon' | 'app'`
2. `registry-adapter.ts`에서 re-export: `export { DeviceType, SubjectRole } from './actor-types.js'`
3. `registry-adapter.ts` 내 타입 위치의 `'daemon' | 'app'` → `DeviceType` 또는 `SubjectRole`로 치환 (5곳)
4. `pg-registry.ts` `revokeAllRefreshTokens(role: 'daemon' | 'app')` → `SubjectRole` 치환 + import 추가
5. `auth.ts` 내 `JwtPayload.role`, `PairBody.type`, `issueRefreshToken(role)` 치환 + import 추가
6. `ws.ts`의 dead `type Role = 'daemon' | 'app'` 삭제

## 2. 완료 조건
- [x] F1: actor-types.ts에 DeviceType, SubjectRole export
- [x] F2: registry-adapter.ts에서 re-export
- [x] F3: 타입 위치의 인라인 `'daemon' | 'app'` 0건 (actor-types.ts 제외)
- [x] F11: ws.ts dead type Role 삭제
- [x] N1: tsc 새 에러 0건

## 3. 롤백 방법
- `git checkout -- packages/relay/src/` + `rm packages/relay/src/registry/actor-types.ts`

---

## Scope

### 수정 대상 파일
```
packages/relay/src/
├── registry/actor-types.ts       # 신규 — DeviceType, SubjectRole 정의
├── registry/registry-adapter.ts  # 수정 — re-export + 5곳 리터럴 치환
├── registry/pg-registry.ts       # 수정 — revokeAllRefreshTokens 시그니처 + import
├── routes/auth.ts                # 수정 — JwtPayload.role, PairBody.type, issueRefreshToken + import
└── routes/ws.ts                  # 수정 — dead type Role 삭제 (1줄)
```

### Side Effect 위험
- 없음. 타입 alias는 structural typing에서 완전 호환. 런타임 값 변경 없음.

### 참고할 기존 패턴
- 없음 (relay에 기존 타입 alias 파일 없음)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| actor-types.ts | F1 | ✅ OK |
| registry-adapter.ts | F2, F3 | ✅ OK |
| pg-registry.ts | F3 (revokeAllRefreshTokens) | ✅ OK |
| auth.ts | F3 (JwtPayload, PairBody, issueRefreshToken) | ✅ OK |
| ws.ts | F11 (dead alias 삭제) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| DeviceType/SubjectRole 정의 | ✅ actor-types.ts | OK |
| re-export | ✅ registry-adapter.ts | OK |
| 9곳 치환 | ✅ registry-adapter.ts, pg-registry.ts, auth.ts | OK |
| dead alias 삭제 | ✅ ws.ts | OK |

### 검증 통과: ✅

---

→ 다음: [Step 02: Record extends CreateParams](step-02-extends.md)
