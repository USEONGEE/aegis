# Step 02: Store 구현체 + Broker 반영

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅ (`git revert`)
- **선행 조건**: Step 01 (타입 정의)

---

## 1. 구현 내용 (design.md 기반)
- `json-approval-store.ts`: 타입 캐스트 추가/조정 (`as JournalStatus`, `as HistoryAction`)
- `sqlite-approval-store.ts`: 타입 캐스트 추가/조정 (`as JournalStatus`, `as HistoryAction`)
- `signed-approval-broker.ts`: `HistoryAction` 타입 적용 (이미 올바른 값 사용 중, 타입 어노테이션만 추가 가능)
- guarded-wdk `tsc --noEmit` 통과 확인

## 2. 완료 조건
- [ ] `json-approval-store.ts`에서 journal status 읽기 시 `as JournalStatus` 캐스트
- [ ] `json-approval-store.ts`에서 history action 읽기 시 `as HistoryAction` 캐스트
- [ ] `sqlite-approval-store.ts`에서 journal status 읽기 시 `as JournalStatus` 캐스트
- [ ] `sqlite-approval-store.ts`에서 history action 읽기 시 `as HistoryAction` 캐스트
- [ ] `signed-approval-broker.ts`의 action 값 할당이 `HistoryAction`과 호환
- [ ] `cd packages/guarded-wdk && npx tsc --noEmit` 에러 0
- [ ] `cd packages/guarded-wdk && npm test` 전체 통과

## 3. 롤백 방법
- `git revert` — 캐스트 변경만이므로 단순 revert 가능
- 영향 범위: guarded-wdk 패키지 내부만

---

## Scope

### 수정 대상 파일
```
packages/guarded-wdk/src/
├── json-approval-store.ts     # 수정 — status/action/type 캐스트 추가
├── sqlite-approval-store.ts   # 수정 — status/action/type 캐스트 추가
└── signed-approval-broker.ts  # 수정 — action 필드 타입 호환 확인 (변경 최소)
```

### 신규 생성 파일
없음

### 의존성 분석
| 모듈 | 영향 유형 | 설명 |
|------|----------|------|
| json-approval-store.ts | 직접 수정 | row → domain 매핑 시 캐스트 |
| sqlite-approval-store.ts | 직접 수정 | row → domain 매핑 시 캐스트 |
| signed-approval-broker.ts | 직접 수정 | action 값 할당 타입 호환 |

### Side Effect 위험
- 런타임 동작 변경 없음 — 타입 캐스트만 추가

### 참고할 기존 패턴
- `json-approval-store.ts:155`: `type: p.type as ApprovalType` (이미 존재하는 캐스트 패턴)
- `sqlite-approval-store.ts:206`: `type: p.type as ApprovalType` (이미 존재하는 캐스트 패턴)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| json-approval-store.ts | 캐스트 추가 (design.md 기술 결정 #3) | ✅ OK |
| sqlite-approval-store.ts | 캐스트 추가 (design.md 기술 결정 #3) | ✅ OK |
| signed-approval-broker.ts | HistoryAction 호환 (design.md 범위) | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| JSON store 캐스트 | ✅ | OK |
| SQLite store 캐스트 | ✅ | OK |
| Broker action 타입 | ✅ | OK |

### 검증 통과: ✅

---

→ 다음: [Step 03: Daemon 연동 + 테스트](step-03-daemon-integration.md)
