# 작업 티켓 - v0.3.5

## 전체 현황

| # | Step | 난이도 | 롤백 | Scope | FP/FN | 개발 | 완료일 |
|---|------|--------|------|-------|-------|------|--------|
| 01 | dead-exports.ts 핵심 구현 | 🟡 | ✅ | ✅ | ✅ | ⏳ | - |
| 02 | registry 등록 + 통합 검증 | 🟢 | ✅ | ✅ | ✅ | ⏳ | - |

## 의존성

```
01 → 02
```

## 커버리지 매트릭스

### PRD 목표 → 티켓

| PRD 목표 | 관련 티켓 | 커버 |
|----------|----------|------|
| HypurrQuant dead-exports 체크를 WDK-APP에 포팅 | Step 01 | ✅ |
| `--check=cross/dead-exports` 실행 시 미사용 export 탐지 | Step 02 | ✅ |

### DoD → 티켓

| DoD 항목 | 관련 티켓 | 커버 |
|----------|----------|------|
| F1: 파일 존재 + CheckResult 반환 | Step 01 | ✅ |
| F2: registry 등록 | Step 02 | ✅ |
| F3: CLI 실행 정상 종료 + violations | Step 02 | ✅ |
| F4: ToolResult 탐지 | Step 02 | ✅ |
| F5: barrel re-export consumed (SqliteApprovalStore) | Step 02 | ✅ |
| F6: import type consumed (RelayEnvelope) | Step 02 | ✅ |
| F7: SCAN_TARGETS 7개 패키지 | Step 01 | ✅ |
| N1: 기존 체크 회귀 없음 | Step 02 | ✅ |
| N2: PACKAGES 상수 미변경 | Step 02 | ✅ |
| E1: App.tsx 제외 | Step 01 (isFirstPartyCode) + Step 02 (출력 검증) | ✅ |
| E2: universe dedup | Step 01 | ✅ |
| E3: namespace import 마킹 | Step 01 | ✅ |

### 설계 결정 → 티켓

| 설계 결정 | 관련 티켓 | 커버 |
|----------|----------|------|
| CheckFn/CheckResult 인터페이스 사용 | Step 01 | ✅ |
| getProject() 캐시 유틸 재사용 | Step 01 | ✅ |
| 7개 패키지 tsconfig 직접 정의 | Step 01 | ✅ |
| SRC_PREFIXES 기반 isFirstPartyCode | Step 01 | ✅ |
| resolveCanonicalOrigin 그대로 포팅 | Step 01 | ✅ |
| Next.js 관련 삭제 | Step 01 | ✅ |
| import type 소비자 마킹 | Step 01 | ✅ |
| HypurrQuant 전용 helper 제거 (shouldExcludeFile, hasCiException, buildResult, measure) | Step 01 | ✅ |
| toRelative → path.relative(MONOREPO_ROOT) 대체 | Step 01 | ✅ |
| CheckResult 직접 반환 (buildResult 제거) | Step 01 | ✅ |
| registry.ts 등록 | Step 02 | ✅ |

## Step 상세
- [Step 01: dead-exports.ts 핵심 구현](step-01-dead-exports-impl.md)
- [Step 02: registry 등록 + 통합 검증](step-02-registry-verify.md)
