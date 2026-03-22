# 작업 티켓 - v0.4.7

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | 소스 파일 export 제거 + dead code 삭제 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | index.ts re-export 정리 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| CI dead-exports PASS 전환 | Step 01, 02 | ✅ |
| dead code 삭제 | Step 01 (A2) | ✅ |
| index.ts가 실제 사용 공개 API만 포함 | Step 02 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: A1 31건 export 제거 | Step 01 | ✅ |
| F2: A2 4건 dead code 삭제 | Step 01 | ✅ |
| F3: guarded-wdk index.ts 정리 | Step 02 | ✅ |
| F4: protocol index.ts 정리 | Step 02 | ✅ |
| F5: canonical index.ts 정리 | Step 02 | ✅ |
| F6: dead-exports manifest only | Step 01 + 02 (종합 결과) | ✅ |
| N1~N5: tsc 통과 | Step 01, 02 각각 검증 | ✅ |
| N6: CI 16 PASS 퇴행 없음 | Step 02 최종 검증 | ✅ |
| N7: daemon 빌드 | Step 01 검증 | ✅ |
| E1~E4: 엣지케이스 | tsc 안전망으로 커버 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| A1 export 키워드 제거 | Step 01 | ✅ |
| A2 dead code 삭제 (4건) | Step 01 | ✅ |
| index.ts 미사용 re-export 제거 (모노레포 소비 기준) | Step 02 | ✅ |
| manifest 제외 | Step 02 (manifest index.ts 미수정) | ✅ |
| barrel export 축소 = breaking change | Step 02 (API/인터페이스 계약 섹션) | ✅ |

## Step 상세
- [Step 01: 소스 파일 export 제거 + dead code 삭제](step-01-source-export-cleanup.md)
- [Step 02: index.ts re-export 정리](step-02-index-cleanup.md)
