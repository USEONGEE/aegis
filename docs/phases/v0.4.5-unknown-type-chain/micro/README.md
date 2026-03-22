# 작업 티켓 - v0.4.5

## 전체 현황

| # | Step | 난이도 | 상태 | 완료일 |
|---|------|--------|------|--------|
| 01 | guarded-wdk 내부 unknown 제거 | 🟡 | ⏳ | - |
| 02 | protocol wire 타입 강화 | 🟡 | ⏳ | - |
| 03 | daemon tool-surface unknown 제거 | 🟡 | ⏳ | - |

## 의존성
01 → 02
01 → 03 (02와 03은 병렬 가능)

## Step 상세
- [Step 01: guarded-wdk 내부 unknown 제거](step-01-guarded-wdk-internal.md)
- [Step 02: protocol wire 타입 강화](step-02-protocol-wire-types.md)
- [Step 03: daemon tool-surface unknown 제거](step-03-daemon-tool-surface.md)

## 트립와이어 체크
- ⚠️ 공개 계약 변경 — protocol 타입, guarded-wdk export 타입 변경. 단, `unknown` → 구체 타입은 TS 하위 호환.
- ⚠️ 디렉토리 경계 — 3개 패키지 (guarded-wdk, protocol, daemon). 범위 명확하므로 quick 유지.
