// ---------------------------------------------------------------------------
// Actor type aliases for relay registry
// ---------------------------------------------------------------------------

/** 디바이스 종류: daemon 프로세스 또는 app 클라이언트 */
export type DeviceType = 'daemon' | 'app'

/** 인증 주체 역할: JWT/refresh token의 발급 대상 */
export type SubjectRole = 'daemon' | 'app'
