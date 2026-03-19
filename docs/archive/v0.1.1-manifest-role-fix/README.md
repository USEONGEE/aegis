# manifest 역할 재정의 - v0.1.1

## 문제 정의

### 현상

**문서/설계상 문제** (실제 코드에는 의존성 미설치):
- v0.1.0 PRD (`docs/PRD.md`)에서 manifest를 "daemon + RN App 양쪽에서 사용"으로 기술
- v0.1.0 design.md에서 `app ──► manifest` 의존 방향 명시
- step-13, step-40에서 "manifest 기반 policy 자동 생성 UI"를 app 구현 범위에 포함
- 하지만 실제 `packages/app/package.json`에는 `@wdk-app/manifest` 의존성이 없고, app 코드에서 manifest를 import하지 않음

**실제 의도**:
- DeFi CLI가 `--policy` 플래그로 필요한 policy JSON을 직접 제공
- AI가 CLI에서 policy JSON을 받아 policyRequest tool_call로 WDK에 전달
- RN App은 policy JSON을 보여주고 승인/거부할 뿐, manifest 규격을 알 필요 없음

### 원인
- v0.1.0 설계 시 manifest의 소비자를 RN App으로 잘못 설정
- 실제 소비자는 DeFi CLI (aave-cli, uniswap-cli 등)

### 영향
- v0.1.0 문서 중 PRD/design.md가 `app ──► manifest` 의존 방향을 잘못 기술
- 향후 개발자가 문서를 보고 app에 manifest 의존성을 추가할 위험
- DeFi CLI `--policy` 패턴이 공식 흐름으로 문서화되지 않음

### 목표
1. `packages/manifest`의 소비자를 "RN App"에서 "DeFi CLI"로 재정의 (문서 수정)
2. v0.1.0 PRD/design.md에서 `app ──► manifest` 의존 서술 제거
3. DeFi CLI `--policy` 패턴을 공식 policy 획득 흐름으로 문서화
4. policy 요청 흐름 정정: AI가 DeFi CLI `--policy`로 policy JSON 획득 → policyRequest tool_call

### 비목표 (Out of Scope)
- manifest 규격 자체 변경 (getPolicyManifest, manifestToPolicy 코드 그대로)
- DeFi CLI 구현 (별도 레포)
- RN App UI 변경 (policy 승인/거부 화면 그대로)
- app 패키지 코드 수정 (이미 manifest를 import하지 않으므로 코드 변경 불필요)

## 제약사항
- 코드 변경 없음 — 문서/설계 정정만
- 수정 대상 문서: `docs/PRD.md`, `docs/phases/v0.1.0-wdk-app-platform/design.md`
- HANDOVER.md는 이미 올바른 역할 분리를 기술하고 있으므로 수정 불필요
- 기존 v0.1.0 phase micro 문서(step-13, step-40 등)는 historical artifact로 유지 — 수정하지 않음
