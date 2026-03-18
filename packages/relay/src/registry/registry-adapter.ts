// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  passwordHash?: string
  createdAt: Date
}

export interface DeviceRecord {
  id: string
  userId: string
  type: 'daemon' | 'app'
  pushToken?: string | null
  lastSeenAt?: Date | null
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
  metadata?: Record<string, unknown> | null
  createdAt: Date
}

export interface SessionListItem {
  id: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface CreateUserParams {
  id: string
  passwordHash: string
}

export interface RegisterDeviceParams {
  id: string
  userId: string
  type: 'daemon' | 'app'
  pushToken?: string
}

export interface CreateSessionParams {
  id: string
  userId: string
  metadata?: Record<string, unknown>
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

  abstract registerDevice (params: RegisterDeviceParams): Promise<DeviceRecord>

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
   * Lifecycle
   * ----------------------------------------------------------------*/

  abstract migrate (): Promise<void>

  abstract close (): Promise<void>
}
