import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import config from '../config.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { RegistryAdapter } from '../registry/registry-adapter.js'

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
  pushToken?: string
}

interface JwtPayload {
  sub: string
}

// ---------------------------------------------------------------------------
// Password utilities
// ---------------------------------------------------------------------------

/**
 * Hash a plaintext password with a random salt.
 * Format: "salt:sha256hex"
 */
function hashPassword (password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a stored "salt:hash" string.
 */
function verifyPassword (password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':')
  const actual = createHash('sha256')
    .update(salt + password)
    .digest()
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/**
 * Issue a JWT token for a userId.
 */
function signToken (userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  })
}

/**
 * Verify and decode a JWT.  Returns the payload or null.
 */
export function verifyToken (token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload
  } catch {
    return null
  }
}

/**
 * Fastify route plugin -- auth endpoints.
 *
 * Expects `fastify.registry` (RegistryAdapter) to be decorated before
 * registration.
 *
 * Routes:
 *   POST /auth/register   { userId, password }
 *   POST /auth/login      { userId, password }
 *   POST /auth/pair       { userId, deviceId, type, pushToken? }
 */
export default async function authRoutes (fastify: FastifyInstance): Promise<void> {
  const registry = (fastify as any).registry as RegistryAdapter

  /* ----------------------------------------------------------------
   * POST /auth/register
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
    const token = signToken(userId)

    return reply.code(201).send({ userId: user.id, token })
  })

  /* ----------------------------------------------------------------
   * POST /auth/login
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
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = signToken(userId)
    return reply.send({ userId, token })
  })

  /* ----------------------------------------------------------------
   * POST /auth/pair
   *
   * Register a device (daemon or app) for a user.  Requires a valid JWT.
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
    // Extract and verify JWT
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid authorization header' })
    }

    const payload = verifyToken(authHeader.slice(7))
    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired token' })
    }

    const userId = payload.sub
    const { deviceId, type, pushToken } = request.body

    const device = await registry.registerDevice({
      id: deviceId,
      userId,
      type,
      pushToken,
    })

    return reply.code(201).send({
      deviceId: device.id,
      userId: device.userId,
      type: device.type,
    })
  })
}
