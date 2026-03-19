# Step 33: app - Expo 프로젝트 셋업 + 탭 네비게이션

## 메타데이터
- **난이도**: 🟡 보통
- **롤백 가능**: ✅
- **선행 조건**: 없음 (독립 패키지)

---

## 1. 구현 내용 (design.md 기반)

`packages/app` Expo 프로젝트 생성. 6탭 Bottom Tab Navigation 구성.

- Expo managed workflow (`npx create-expo-app`)
- Bottom Tab Navigator (6탭): Chat, Policy, Approval, Activity, Dashboard, Settings
- 전역 Provider 트리 (`AppProviders.tsx`)
- zustand 상태 관리 기본 셋업
- 기본 디렉토리 구조 (design.md의 app 모듈 구조)

**6개 탭 (PRD 참조)**:
| 탭 | 아이콘 | 화면 |
|----|--------|------|
| Chat | 💬 | ChatScreen |
| Policy | 📋 | PolicyScreen |
| Approval | ✅ | ApprovalScreen |
| Activity | 📊 | ActivityScreen |
| Dashboard | 💰 | DashboardScreen |
| Settings | ⚙️ | SettingsScreen |

각 탭 화면은 placeholder ("Coming Soon") 텍스트만 표시. 이후 step에서 구현.

## 2. 완료 조건
- [ ] `packages/app/` Expo 프로젝트 생성
- [ ] `packages/app/package.json` (name: `@wdk-app/app`)
- [ ] `src/app/App.tsx` — 앱 진입점
- [ ] `src/app/providers/AppProviders.tsx` — NavigationContainer 포함 전역 Provider
- [ ] `src/app/RootNavigator.tsx` — Bottom Tab Navigator (6탭)
- [ ] 각 탭 화면 placeholder 파일 생성 (ChatScreen, PolicyScreen, ApprovalScreen, ActivityScreen, DashboardScreen, SettingsScreen)
- [ ] `@react-navigation/bottom-tabs` + `@react-navigation/native` 설치
- [ ] zustand 설치
- [ ] 각 탭이 독립적으로 렌더링 (탭 전환 동작)
- [ ] `npx expo export` 빌드 성공
- [ ] 루트 `package.json` workspaces에 `packages/app` 추가

## 3. 롤백 방법
- `packages/app` 디렉토리 삭제
- 루트 `package.json`에서 workspace 제거

---

## Scope

### 신규 생성 파일
```
packages/app/
  package.json
  app.json                         # Expo 설정
  tsconfig.json
  babel.config.js
  src/
    app/
      App.tsx                      # 진입점
      providers/
        AppProviders.tsx           # 전역 Provider 트리
      RootNavigator.tsx            # Bottom Tab Navigator
    domains/
      chat/screens/
        ChatScreen.tsx             # placeholder
      policy/screens/
        PolicyScreen.tsx           # placeholder
      approval/screens/
        ApprovalScreen.tsx         # placeholder
      activity/screens/
        ActivityScreen.tsx         # placeholder
      dashboard/screens/
        DashboardScreen.tsx        # placeholder
      settings/screens/
        SettingsScreen.tsx         # placeholder
    stores/                        # zustand store 디렉토리 (빈 상태)
    core/                          # core 모듈 디렉토리 (빈 상태)
    shared/                        # shared 모듈 디렉토리 (빈 상태)
```

### 수정 대상 파일
```
package.json                       # workspaces에 packages/app 추가
```

### Side Effect 위험
- 없음 (신규 패키지)

## FP/FN 검증

### False Positive (과잉)
| Scope 항목 | 구현 내용 근거 | 판정 |
|-----------|---------------|------|
| App.tsx | 앱 진입점 | ✅ OK |
| AppProviders.tsx | Provider 트리 (HypurrQuant 패턴) | ✅ OK |
| RootNavigator.tsx | 6탭 네비게이션 | ✅ OK |
| 6개 Screen placeholder | 각 탭 화면 | ✅ OK |

### False Negative (누락)
| 구현 내용 | Scope 포함 | 판정 |
|----------|-----------|------|
| Expo 프로젝트 설정 | ✅ package.json, app.json | OK |
| Bottom Tab Navigator | ✅ RootNavigator.tsx | OK |
| zustand 셋업 | ✅ package.json + stores/ | OK |
| 디렉토리 구조 | ✅ domains/core/shared/stores | OK |

### 검증 통과: ✅

---

→ 다음: [Step 34: app - IdentityKeyManager](step-34-identity-key.md)
