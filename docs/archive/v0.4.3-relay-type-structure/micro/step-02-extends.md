# Step 02: Record extends CreateParams + intersection 제거

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (extends 제거 + 필드 복원)
- **선행 조건**: Step 01 완료 (리터럴이 alias로 정리되어야 extends 적용 시 diff 깔끔)

---

## 1. 구현 내용 (design.md Step B)

1. 7쌍의 Record에 `extends CreateParams` 적용:
   - `UserRecord extends CreateUserParams { createdAt: Date }`
   - `DeviceRecord extends CreateDeviceParams { lastSeenAt: Date | null; createdAt: Date }`
   - `SessionRecord extends CreateSessionParams { createdAt: Date }`
   - `DaemonRecord extends CreateDaemonParams { createdAt: Date }`
   - `DaemonUserRecord extends CreateDaemonUserParams { boundAt: Date }`
   - `RefreshTokenRecord extends CreateRefreshTokenParams { createdAt: Date; revokedAt: Date | null }`
   - `EnrollmentCodeRecord extends CreateEnrollmentCodeParams { usedAt: Date | null }`
2. Record body에서 CreateParams와 중복되는 필드 제거
3. `getUser` 반환 타입: `(UserRecord & { passwordHash: string }) | null` → `UserRecord | null`
4. `getDaemon` 반환 타입: `(DaemonRecord & { secretHash: string }) | null` → `DaemonRecord | null`
5. `pg-registry.ts`의 `getUser`, `getDaemon` 반환 타입도 동일하게 변경

## 2. 완료 조건
- [x] F4: 7쌍 모두 extends 적용
- [x] F5: Record body에 CreateParams 중복 필드 없음
- [x] F9: getUser intersection 제거됨
- [x] F10: getDaemon intersection 제거됨
- [x] N1: tsc 새 에러 0건
- [x] E1: pg-registry createUser RETURNING 불완전 → tsc 여전히 통과
- [x] E2: auth.ts getUser null 가드 → TS narrowing 유지

## 3. 롤백 방법
- `git checkout -- packages/relay/src/registry/registry-adapter.ts packages/relay/src/registry/pg-registry.ts`

---

## Scope

### 수정 대상 파일
```
packages/relay/src/
├── registry/registry-adapter.ts  # 수정 — 7쌍 extends + intersection 제거
└── registry/pg-registry.ts       # 수정 — getUser/getDaemon 반환 타입 정합
```

### Side Effect 위험
- **pg-registry RETURNING 불완전**: createUser가 passwordHash를 RETURNING하지 않지만, `pg.Pool.query`의 `rows[0]`이 `any`로 추론되므로 컴파일 에러 없음. 기존 동작과 동일.
- **auth.ts 소비자**: intersection 제거 후에도 null 가드(`!user.passwordHash`)가 TS narrowing을 수행하므로 타입 안전성 유지.

### 참고할 기존 패턴
- `packages/guarded-wdk/src/approval-store.ts`: `StoredPolicy extends PolicyInput` 등 v0.2.1 선례

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| registry-adapter.ts | F4, F5, F9, F10 | ✅ OK |
| pg-registry.ts | F9, F10 (구현체 반환 타입) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| 7쌍 extends | ✅ registry-adapter.ts | OK |
| intersection 제거 | ✅ registry-adapter.ts + pg-registry.ts | OK |
| auth.ts 영향 | auth.ts는 interface 소비만. import 변경 불필요 (getUser 반환 타입이 바뀌지만 auth.ts 코드 수정 불필요) | OK — Scope 외 |

### 검증 통과: ✅

---

→ 다음: [Step 03: ListItem Pick 파생](step-03-pick.md)
