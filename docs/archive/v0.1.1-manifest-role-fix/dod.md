# DoD (Definition of Done) - v0.1.1

## 기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| F1 | PRD.md line 510 "manifest → policy 변환은 RN App 또는 CLI에서"가 "DeFi CLI에서"로 정정 | `grep -n "RN App.*manifest\|manifest.*RN App" docs/PRD.md` → 매칭 없음 |
| F2 | PRD.md line 760 "manifest/ ← Layer 2 (policy 카탈로그, daemon·앱 공통)"에서 "앱 공통" 제거 | `grep "daemon.*앱.*공통\|앱.*공통" docs/PRD.md` → 매칭 없음 |
| F3 | PRD.md에 DeFi CLI `--policy` 패턴이 policy 획득 공식 흐름으로 추가 | `grep "\-\-policy" docs/PRD.md` → 해당 서술 존재 |
| F4 | v0.1.0 design.md 의존 방향에서 `app ──► manifest` 제거 | `grep "app.*manifest" docs/phases/v0.1.0-wdk-app-platform/design.md` → `app (manifest 의존 없음)` 같은 부정문만 허용 |
| F5 | v0.1.0 design.md Ownership Boundary에서 manifest 역할이 "DeFi CLI용 카탈로그"로 명시 | manifest 행에 "DeFi CLI" 언급 |

## 비기능 완료 조건

| # | 조건 | 검증 방법 |
|---|------|----------|
| N1 | 기존 테스트 전부 통과 (코드 변경 없음) | `NODE_OPTIONS=--experimental-vm-modules npx jest --config '{}' --roots packages/canonical/tests packages/guarded-wdk/tests packages/manifest/tests packages/daemon/tests packages/relay/tests packages/app/tests` → 242 passed |
| N2 | app/package.json에 @wdk-app/manifest 없음 | `grep "@wdk-app/manifest" packages/app/package.json` → 매칭 없음 |

## 엣지케이스

| # | 시나리오 | 기대 동작 | 검증 방법 |
|---|---------|----------|----------|
| E1 | PRD/design.md 어디에도 "RN App이 manifest를 소비/import/사용"하는 서술 없음 | 없어야 함 | `grep -n "RN App.*manifest\|app.*manifest.*import\|app.*manifest.*사용\|앱.*manifest.*공통" docs/PRD.md docs/phases/v0.1.0-wdk-app-platform/design.md` → 매칭 없음 (부정문 제외) |
