// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  passwordHash: string | null
  createdAt: Date
}

export interface DeviceRecord {
  id: string
  userId: string
  type: 'daemon' | 'app'
  pushToken: string | null
  lastSeenAt: Date | null
  createdAt: Date
}

export interface DeviceListItem {
  id: string
  type: string
  pushToken: string | null
  lastSeenAt: Date | null
}

export interface SessionRecord {
  id: string
  userId: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface SessionListItem {
  id: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface CreateUserParams {
  id: string
  passwordHash: string | null  // null for OAuth users
}

export interface CreateDeviceParams {
  id: string
  userId: string
  type: 'daemon' | 'app'
  pushToken: string | null
}

export interface CreateSessionParams {
  id: string
  userId: string
  metadata: Record<string, unknown> | null
}

export interface DaemonRecord {
  id: string
  secretHash: string
  createdAt: Date
}

export interface CreateDaemonParams {
  id: string
  secretHash: string
}

export interface DaemonUserRecord {
  daemonId: string
  userId: string
  boundAt: Date
}

export interface RefreshTokenRecord {
  id: string
  subjectId: string
  role: 'daemon' | 'app'
  deviceId: string | null
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
}

export interface CreateRefreshTokenParams {
  id: string
  subjectId: string
  role: 'daemon' | 'app'
  deviceId: string | null
  expiresAt: Date
}

export interface CreateDaemonUserParams {
  daemonId: string
  userId: string
}

export interface CreateEnrollmentCodeParams {
  code: string
  daemonId: string
  expiresAt: Date
}

export interface EnrollmentCodeRecord {
  code: string
  daemonId: string
  expiresAt: Date
  usedAt: Date | null
}

/**
 * Abstract RegistryAdapter interface.
 *
 * Backed by PostgreSQL in production.  The registry stores users, devices,
 * and sessions -- purely for routing and push-notification purposes.
 * Security decisions (trustedApprovers, device revocation) live in the daemon.
 */
export abstract class RegistryAdapter {
  /* ------------------------------------------------------------------
   * Users
   * ----------------------------------------------------------------*/

  abstract createUser (params: CreateUserParams): Promise<UserRecord>

  abstract getUser (id: string): Promise<(UserRecord & { passwordHash: string }) | null>

  /* ------------------------------------------------------------------
   * Devices
   * ----------------------------------------------------------------*/

  abstract createDevice (params: CreateDeviceParams): Promise<DeviceRecord>

  abstract getDevice (id: string): Promise<DeviceRecord | null>

  abstract getDevicesByUser (userId: string): Promise<DeviceListItem[]>

  abstract touchDevice (id: string): Promise<void>

  abstract updatePushToken (id: string, pushToken: string): Promise<void>

  /* ------------------------------------------------------------------
   * Sessions
   * ----------------------------------------------------------------*/

  abstract createSession (params: CreateSessionParams): Promise<SessionRecord>

  abstract getSession (id: string): Promise<SessionRecord | null>

  abstract getSessionsByUser (userId: string): Promise<SessionListItem[]>

  /* ------------------------------------------------------------------
   * Daemons
   * ----------------------------------------------------------------*/

  abstract createDaemon (params: CreateDaemonParams): Promise<DaemonRecord>

  abstract getDaemon (id: string): Promise<(DaemonRecord & { secretHash: string }) | null>

  /* ------------------------------------------------------------------
   * Daemon-User Binding
   * ----------------------------------------------------------------*/

  abstract bindUser (params: CreateDaemonUserParams): Promise<DaemonUserRecord>

  abstract unbindUsers (daemonId: string, userIds: string[]): Promise<string[]>

  abstract getUsersByDaemon (daemonId: string): Promise<string[]>

  abstract getDaemonByUser (userId: string): Promise<string | null>

  /* ------------------------------------------------------------------
   * Refresh Tokens
   * ----------------------------------------------------------------*/

  abstract createRefreshToken (params: CreateRefreshTokenParams): Promise<RefreshTokenRecord>

  abstract getRefreshToken (id: string): Promise<RefreshTokenRecord | null>

  abstract revokeRefreshToken (id: string): Promise<void>

  abstract revokeAllRefreshTokens (subjectId: string, role: 'daemon' | 'app'): Promise<void>

  /* ------------------------------------------------------------------
   * Enrollment Codes
   * ----------------------------------------------------------------*/

  abstract createEnrollmentCode (params: CreateEnrollmentCodeParams): Promise<EnrollmentCodeRecord>

  abstract getEnrollmentCode (code: string): Promise<EnrollmentCodeRecord | null>

  /** Atomically claim an enrollment code. Returns the record if claimed, null if already used or expired. */
  abstract claimEnrollmentCode (code: string): Promise<EnrollmentCodeRecord | null>

  /* ------------------------------------------------------------------
   * Lifecycle
   * ----------------------------------------------------------------*/

  abstract migrate (): Promise<void>

  abstract close (): Promise<void>
}
