import type { DeviceType, SubjectRole } from './actor-types.js'
export type { DeviceType, SubjectRole } from './actor-types.js'

// ---------------------------------------------------------------------------
// Create Params (Input DTOs — depth 0 leaf)
// ---------------------------------------------------------------------------

export interface CreateUserParams {
  id: string
  passwordHash: string | null  // null for OAuth users
}

export interface CreateDeviceParams {
  id: string
  userId: string
  type: DeviceType
  pushToken: string | null
}

export interface CreateSessionParams {
  id: string
  userId: string
  metadata: Record<string, unknown> | null
}

export interface CreateDaemonParams {
  id: string
  secretHash: string
}

export interface CreateDaemonUserParams {
  daemonId: string
  userId: string
}

export interface CreateRefreshTokenParams {
  id: string
  subjectId: string
  role: SubjectRole
  deviceId: string | null
  expiresAt: Date
}

export interface CreateEnrollmentCodeParams {
  code: string
  daemonId: string
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// Records (Stored types — depth 1, extends CreateParams)
// ---------------------------------------------------------------------------

export interface UserRecord extends CreateUserParams {
  createdAt: Date
}

export interface DeviceRecord extends CreateDeviceParams {
  lastSeenAt: Date | null
  createdAt: Date
}

export interface SessionRecord extends CreateSessionParams {
  createdAt: Date
}

export interface DaemonRecord extends CreateDaemonParams {
  createdAt: Date
}

export interface DaemonUserRecord extends CreateDaemonUserParams {
  boundAt: Date
}

export interface RefreshTokenRecord extends CreateRefreshTokenParams {
  createdAt: Date
  revokedAt: Date | null
}

export interface EnrollmentCodeRecord extends CreateEnrollmentCodeParams {
  usedAt: Date | null
}

// ---------------------------------------------------------------------------
// List Items (read projections — depth 1, Pick from Record)
// ---------------------------------------------------------------------------

export type DeviceListItem = Pick<DeviceRecord, 'id' | 'type' | 'pushToken' | 'lastSeenAt'>

export type SessionListItem = Pick<SessionRecord, 'id' | 'metadata' | 'createdAt'>

// ---------------------------------------------------------------------------
// Abstract RegistryAdapter
// ---------------------------------------------------------------------------

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

  abstract getUser (id: string): Promise<UserRecord | null>

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

  abstract getDaemon (id: string): Promise<DaemonRecord | null>

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

  abstract revokeAllRefreshTokens (subjectId: string, role: SubjectRole): Promise<void>

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
