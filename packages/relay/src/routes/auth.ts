import { createHash, randomBytes, timingSafeEqual, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'
import config from '../config.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { RegistryAdapter } from '../registry/registry-adapter.js'
import type { QueueAdapter } from '../queue/queue-adapter.js'

// ---------------------------------------------------------------------------
// Google OAuth token verification
// ---------------------------------------------------------------------------

interface GoogleJWK {
  kid: string
  kty: string
  alg: string
  use: string
  n: string
  e: string
  [key: string]: unknown
}

let _googleCertsCache: { keys: GoogleJWK[], fetchedAt: number } | null = null

async function fetchGoogleCerts (): Promise<GoogleJWK[]> {
  if (_googleCertsCache && Date.now() - _googleCertsCache.fetchedAt < 3600_000) {
    return _googleCertsCache.keys
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  if (!res.ok) throw new Error(`Failed to fetch Google certs: ${res.status}`)
  const data = await res.json() as { keys: GoogleJWK[] }
  _googleCertsCache = { keys: data.keys, fetchedAt: Date.now() }
  return data.keys
}

async function verifyGoogleIdToken (idToken: string): Promise<{ sub: string, email?: string }> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  // Verify expiry
  if (payload.exp && payload.exp < Date.now() / 1000) {
    throw new Error('Token expired')
  }

  // Verify issuer
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
    throw new Error('Invalid issuer')
  }

  // Verify signature against Google's public keys
  const certs = await fetchGoogleCerts()
  const cert = certs.find((k: GoogleJWK) => k.kid === header.kid)
  if (!cert) throw new Error('Unknown signing key')

  const publicKey = createPublicKey({ key: cert, format: 'jwk' })
  const signatureInput = `${parts[0]}.${parts[1]}`
  const signature = Buffer.from(parts[2], 'base64url')
  const valid = cryptoVerify(
    header.alg === 'RS256' ? 'sha256' : 'sha256',
    Buffer.from(signatureInput),
    publicKey,
    signature
  )
  if (!valid) throw new Error('Invalid signature')

  if (!payload.sub) throw new Error('Missing sub claim')
  return { sub: payload.sub, email: payload.email }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisterBody {
  userId: string
  password: string
}

interface LoginBody {
  userId: string
  password: string
}

interface PairBody {
  deviceId: string
  type: 'daemon' | 'app'
  pushToken: string | null
}

interface DaemonRegisterBody {
  daemonId: string
  secret: string
}

interface DaemonLoginBody {
  daemonId: string
  secret: string
}

interface RefreshBody {
  refreshToken: string
}

interface EnrollConfirmBody {
  enrollmentCode: string
}

interface UnbindBody {
  userIds: string[]
}

export interface JwtPayload {
  sub: string
  role: 'daemon' | 'app'
  deviceId: string | null
}

// ---------------------------------------------------------------------------
// Password utilities
// ---------------------------------------------------------------------------

export function hashPassword (password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex')
  return `${salt}:${hash}`
}

export function verifyPassword (password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':')
  const actual = createHash('sha256')
    .update(salt + password)
    .digest()
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

// ---------------------------------------------------------------------------
// JWT utilities
// ---------------------------------------------------------------------------

function signAppToken (userId: string, deviceId: string | null): string {
  const payload: Record<string, unknown> = { sub: userId, role: 'app' }
  if (deviceId !== null) payload.deviceId = deviceId
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as StringValue,
  })
}

function signDaemonToken (daemonId: string): string {
  return jwt.sign({ sub: daemonId, role: 'daemon' }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as StringValue,
  })
}

export function verifyToken (token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as Record<string, unknown>
    return {
      sub: decoded.sub as string,
      role: (decoded.role as JwtPayload['role']) || 'app',
      deviceId: (decoded.deviceId as string) ?? null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Refresh token utilities
// ---------------------------------------------------------------------------

function generateRefreshToken (): string {
  return randomBytes(32).toString('hex')
}

function generateEnrollmentCode (): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = randomBytes(8)
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return code.slice(0, 4) + '-' + code.slice(4)
}

async function issueRefreshToken (
  registry: RegistryAdapter,
  subjectId: string,
  role: 'daemon' | 'app',
  deviceId: string | null = null
): Promise<string> {
  const id = generateRefreshToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  await registry.createRefreshToken({ id, subjectId, role, deviceId, expiresAt })
  return id
}

// ---------------------------------------------------------------------------
// Helper: extract bearer token from request
// ---------------------------------------------------------------------------

function extractBearer (request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}

function requireBearer (request: FastifyRequest, reply: FastifyReply): JwtPayload | null {
  const token = extractBearer(request)
  if (!token) {
    reply.code(401).send({ error: 'Missing or invalid authorization header' })
    return null
  }
  const payload = verifyToken(token)
  if (!payload) {
    reply.code(401).send({ error: 'Invalid or expired token' })
    return null
  }
  return payload
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export default async function authRoutes (fastify: FastifyInstance): Promise<void> {
  const registry = (fastify as unknown as { registry: RegistryAdapter }).registry

  /* ----------------------------------------------------------------
   * POST /auth/register  (legacy user registration)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'password'],
        properties: {
          userId: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const { userId, password } = request.body

    const existing = await registry.getUser(userId)
    if (existing) {
      return reply.code(409).send({ error: 'User already exists' })
    }

    const passwordHash = hashPassword(password)
    const user = await registry.createUser({ id: userId, passwordHash })
    const token = signAppToken(userId, null)
    const refreshToken = await issueRefreshToken(registry, userId, 'app')

    return reply.code(201).send({ userId: user.id, token, refreshToken })
  })

  /* ----------------------------------------------------------------
   * POST /auth/login  (legacy user login)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'password'],
        properties: {
          userId: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { userId, password } = request.body

    const user = await registry.getUser(userId)
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = signAppToken(userId, null)
    const refreshToken = await issueRefreshToken(registry, userId, 'app')
    return reply.send({ userId, token, refreshToken })
  })

  /* ----------------------------------------------------------------
   * POST /auth/pair  (legacy device pairing)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/pair', {
    schema: {
      body: {
        type: 'object',
        required: ['deviceId', 'type'],
        properties: {
          deviceId: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['daemon', 'app'] },
          pushToken: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: PairBody }>, reply: FastifyReply) => {
    const payload = requireBearer(request, reply)
    if (!payload) return

    const userId = payload.sub
    const { deviceId, type, pushToken } = request.body

    const device = await registry.createDevice({
      id: deviceId,
      userId,
      type,
      pushToken: pushToken ?? null,
    })

    return reply.code(201).send({
      deviceId: device.id,
      userId: device.userId,
      type: device.type,
    })
  })

  /* ----------------------------------------------------------------
   * POST /auth/refresh  (shared: daemon + app)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const { refreshToken } = request.body

    const stored = await registry.getRefreshToken(refreshToken)
    if (!stored) {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    // Revoked? → replay attack → revoke all for this subject
    if (stored.revokedAt) {
      await registry.revokeAllRefreshTokens(stored.subjectId, stored.role)
      return reply.code(401).send({ error: 'Refresh token revoked (possible replay)' })
    }

    // Expired?
    if (stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Refresh token expired' })
    }

    // Rotate: revoke old, issue new
    await registry.revokeRefreshToken(stored.id)

    const newRefreshToken = await issueRefreshToken(registry, stored.subjectId, stored.role, stored.deviceId)
    const token = stored.role === 'daemon'
      ? signDaemonToken(stored.subjectId)
      : signAppToken(stored.subjectId, stored.deviceId)

    return reply.send({ token, refreshToken: newRefreshToken })
  })

  /* ================================================================
   * DAEMON AUTH
   * ================================================================*/

  /* ----------------------------------------------------------------
   * POST /auth/daemon/register
   * ----------------------------------------------------------------*/
  fastify.post('/auth/daemon/register', {
    schema: {
      body: {
        type: 'object',
        required: ['daemonId', 'secret'],
        properties: {
          daemonId: { type: 'string', minLength: 1 },
          secret: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: DaemonRegisterBody }>, reply: FastifyReply) => {
    const { daemonId, secret } = request.body

    const existing = await registry.getDaemon(daemonId)
    if (existing) {
      return reply.code(409).send({ error: 'Daemon already exists' })
    }

    const secretHash = hashPassword(secret)
    await registry.createDaemon({ id: daemonId, secretHash })

    return reply.code(201).send({ daemonId })
  })

  /* ----------------------------------------------------------------
   * POST /auth/daemon/login
   * ----------------------------------------------------------------*/
  fastify.post('/auth/daemon/login', {
    schema: {
      body: {
        type: 'object',
        required: ['daemonId', 'secret'],
        properties: {
          daemonId: { type: 'string' },
          secret: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: DaemonLoginBody }>, reply: FastifyReply) => {
    const { daemonId, secret } = request.body

    const daemon = await registry.getDaemon(daemonId)
    if (!daemon) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    if (!verifyPassword(secret, daemon.secretHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = signDaemonToken(daemonId)
    const refreshToken = await issueRefreshToken(registry, daemonId, 'daemon')
    return reply.send({ daemonId, token, refreshToken })
  })

  /* ================================================================
   * DEVICE ENROLLMENT
   * ================================================================*/

  /* ----------------------------------------------------------------
   * POST /auth/daemon/enroll  (daemon JWT required)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/daemon/enroll', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = requireBearer(request, reply)
    if (!payload) return
    if (payload.role !== 'daemon') {
      return reply.code(403).send({ error: 'Daemon token required' })
    }

    const daemonId = payload.sub
    const code = generateEnrollmentCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    await registry.createEnrollmentCode({ code, daemonId, expiresAt })

    return reply.send({ enrollmentCode: code, expiresIn: 300 })
  })

  /* ----------------------------------------------------------------
   * POST /auth/enroll/confirm  (app JWT required)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/enroll/confirm', {
    schema: {
      body: {
        type: 'object',
        required: ['enrollmentCode'],
        properties: {
          enrollmentCode: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: EnrollConfirmBody }>, reply: FastifyReply) => {
    const payload = requireBearer(request, reply)
    if (!payload) return
    if (payload.role !== 'app') {
      return reply.code(403).send({ error: 'App token required' })
    }

    const userId = payload.sub
    const { enrollmentCode } = request.body

    // Atomic claim: sets used_at, returns null if already used or expired
    const enrollment = await registry.claimEnrollmentCode(enrollmentCode)
    if (!enrollment) {
      return reply.code(404).send({ error: 'Invalid, expired, or already used enrollment code' })
    }

    // Bind user to daemon
    try {
      await registry.bindUser({ daemonId: enrollment.daemonId, userId })
    } catch (err: unknown) {
      // UNIQUE violation → user already bound to another daemon
      const errObj = err as { code?: string; message?: string }
      if (errObj.code === '23505' || errObj.message?.includes('unique') || errObj.message?.includes('duplicate')) {
        return reply.code(409).send({ error: 'User already bound to another daemon' })
      }
      throw err
    }

    // Notify daemon via WS if connected (handled by ws.ts event system)
    const queue = (fastify as unknown as { queue?: QueueAdapter }).queue
    if (queue) {
      await queue.publish(`daemon-events:${enrollment.daemonId}`, {
        type: 'user_bound',
        userId,
        timestamp: String(Date.now()),
      })
    }

    return reply.send({ daemonId: enrollment.daemonId, userId, bound: true })
  })

  /* ----------------------------------------------------------------
   * POST /auth/daemon/unbind  (daemon JWT required)
   * ----------------------------------------------------------------*/
  fastify.post('/auth/daemon/unbind', {
    schema: {
      body: {
        type: 'object',
        required: ['userIds'],
        properties: {
          userIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: UnbindBody }>, reply: FastifyReply) => {
    const payload = requireBearer(request, reply)
    if (!payload) return
    if (payload.role !== 'daemon') {
      return reply.code(403).send({ error: 'Daemon token required' })
    }

    const daemonId = payload.sub
    const { userIds } = request.body
    const unbound = await registry.unbindUsers(daemonId, userIds)

    // Notify daemon via WS for each unbound user
    const queue = (fastify as unknown as { queue?: QueueAdapter }).queue
    if (queue) {
      for (const userId of unbound) {
        await queue.publish(`daemon-events:${daemonId}`, {
          type: 'user_unbound',
          userId,
          timestamp: String(Date.now()),
        })
      }
    }

    return reply.send({ unbound })
  })

  /* ================================================================
   * GOOGLE OAUTH
   * ================================================================*/

  /* ----------------------------------------------------------------
   * POST /auth/google  { idToken, deviceId }
   *
   * Verifies a Google ID token, auto-creates user if needed,
   * returns app JWT + refresh token.
   * ----------------------------------------------------------------*/
  fastify.post('/auth/google', {
    schema: {
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string' },
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { idToken: string, deviceId?: string } }>, reply: FastifyReply) => {
    const { idToken, deviceId } = request.body

    // Verify Google ID token (signature + issuer + expiry)
    let googleSub: string
    try {
      const verified = await verifyGoogleIdToken(idToken)
      googleSub = verified.sub
    } catch (err: unknown) {
      return reply.code(401).send({ error: `Invalid Google ID token: ${err instanceof Error ? err.message : String(err)}` })
    }

    // Use Google sub as userId (prefixed to avoid collision)
    const userId = `google:${googleSub}`

    // Auto-create user if not exists
    const existing = await registry.getUser(userId)
    if (!existing) {
      await registry.createUser({ id: userId, passwordHash: null })
    }

    const token = signAppToken(userId, deviceId ?? null)
    const refreshToken = await issueRefreshToken(registry, userId, 'app', deviceId ?? null)

    return reply.send({ userId, token, refreshToken })
  })
}
