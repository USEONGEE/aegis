# 작업 티켓 - v0.4.3

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | actor-types 추출 | 🟢 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-22 |
| 02 | Record extends CreateParams | 🟡 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-22 |
| 03 | ListItem Pick 파생 + 최종 통합 검증 | 🟡 | ✅ | ✅ | ✅ | ✅ 완료 | 2026-03-22 |

## 의존성

```
01 → 02 → 03
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| 리터럴을 의미별 타입 alias로 추출 | Step 01 | ✅ |
| 7쌍에 Record extends CreateParams 적용 | Step 02 | ✅ |
| ListItem Pick 파생 + DeviceListItem.type 버그 해소 | Step 03 | ✅ |
| intersection type 제거 | Step 02 | ✅ |
| ws.ts dead Role 삭제 | Step 01 | ✅ |
| tsc 통과 | Step 01, 02, 03 (각 Step에서 N1 검증) | ✅ |
| 기존 동작 유지 | Step 03 (최종 통합 검증: N2, N4, E3, E4) | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: actor-types.ts에 DeviceType, SubjectRole export | Step 01 | ✅ |
| F2: registry-adapter.ts re-export | Step 01 | ✅ |
| F3: 타입 위치 인라인 리터럴 0건 | Step 01 | ✅ |
| F4: 7쌍 extends 적용 | Step 02 | ✅ |
| F5: 중복 필드 없음 | Step 02 | ✅ |
| F6: DeviceListItem Pick 파생 | Step 03 | ✅ |
| F7: SessionListItem Pick 파생 | Step 03 | ✅ |
| F8: DeviceListItem.type = DeviceType | Step 03 | ✅ |
| F9: getUser intersection 제거 | Step 02 | ✅ |
| F10: getDaemon intersection 제거 | Step 02 | ✅ |
| F11: ws.ts dead Role 삭제 | Step 01 | ✅ |
| N1: tsc 통과 | Step 01, 02, 03 | ✅ |
| N2: relay 테스트 통과 | Step 03 (최종 통합 검증) | ✅ |
| N3: dead-exports 체크 통과 | Step 03 (최종 통합 검증) | ✅ |
| N4: 순수 타입 리팩토링 | Step 03 (최종 통합 검증) | ✅ |
| N5: SQL 변경 0건 | Step 03 (최종 통합 검증) | ✅ |
| E1: pg-registry RETURNING 기존 상태 유지 | Step 02 | ✅ |
| E2: getUser null 가드 유지 | Step 02 | ✅ |
| E3: DeviceListItem.type 좁힘 호환 | Step 03 | ✅ |
| E4: Fastify JSON schema enum 유지 | Step 03 (auth.ts 간접 검증) | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| actor-types.ts를 registry/에 배치 | Step 01 | ✅ |
| registry-adapter.ts에서 re-export | Step 01 | ✅ |
| DeviceType ≠ SubjectRole 분리 | Step 01 | ✅ |
| extends 패턴 (v0.2.1 선례) | Step 02 | ✅ |
| Pick 파생 | Step 03 | ✅ |
| getUser/getDaemon intersection 제거 | Step 02 | ✅ |
| A→B→C 순서 | Step 01→02→03 | ✅ |

## Step 상세
- [Step 01: actor-types 추출](step-01-actor-types.md)
- [Step 02: Record extends CreateParams](step-02-extends.md)
- [Step 03: ListItem Pick 파생](step-03-pick.md)
