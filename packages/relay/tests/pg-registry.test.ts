import { jest } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock pg and config BEFORE importing PgRegistry
// ---------------------------------------------------------------------------

interface MockPool {
  query: jest.Mock
  end: jest.Mock
}

const mockPool: MockPool = {
  query: jest.fn(),
  end: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined)
}

jest.unstable_mockModule('pg', () => ({
  default: {
    Pool: jest.fn().mockImplementation(() => mockPool)
  }
}))

jest.unstable_mockModule('../src/config.js', () => ({
  default: {
    database: { url: 'postgresql://test:test@localhost:5432/test' }
  }
}))

// Mock fs for migrate()
jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn().mockReturnValue('CREATE TABLE users (...);')
}))

const { PgRegistry } = await import('../src/registry/pg-registry.js')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PgRegistry', () => {
  let registry: InstanceType<typeof PgRegistry>

  beforeEach(() => {
    jest.clearAllMocks()
    registry = new PgRegistry({ connectionString: 'postgresql://test:test@localhost/test' })
  })

  // -------------------------------------------------------------------------
  // createUser
  // -------------------------------------------------------------------------

  test('createUser inserts a user and returns the row', async () => {
    const row = { id: 'user_1', createdAt: new Date() }
    mockPool.query.mockResolvedValue({ rows: [row] })

    const result = await registry.createUser({ id: 'user_1', passwordHash: 'hash123' })

    expect(result).toEqual(row)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['user_1', 'hash123']
    )
  })

  // -------------------------------------------------------------------------
  // getUser
  // -------------------------------------------------------------------------

  test('getUser returns user when found', async () => {
    const row = { id: 'user_1', passwordHash: 'hash123', createdAt: new Date() }
    mockPool.query.mockResolvedValue({ rows: [row] })

    const result = await registry.getUser('user_1')

    expect(result).toEqual(row)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM users WHERE id'),
      ['user_1']
    )
  })

  test('getUser returns null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] })

    const result = await registry.getUser('nonexistent')

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // registerDevice
  // -------------------------------------------------------------------------

  test('registerDevice inserts/upserts a device and returns the row', async () => {
    const row = { id: 'dev_1', userId: 'user_1', type: 'daemon', createdAt: new Date() }
    mockPool.query.mockResolvedValue({ rows: [row] })

    const result = await registry.registerDevice({
      id: 'dev_1',
      userId: 'user_1',
      type: 'daemon',
      pushToken: 'expo_tok'
    })

    expect(result).toEqual(row)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO devices'),
      ['dev_1', 'user_1', 'daemon', 'expo_tok']
    )
  })

  test('registerDevice passes null when pushToken is undefined', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ id: 'dev_2' }] })

    await registry.registerDevice({
      id: 'dev_2',
      userId: 'user_1',
      type: 'app'
    })

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO devices'),
      ['dev_2', 'user_1', 'app', null]
    )
  })

  // -------------------------------------------------------------------------
  // getDevice
  // -------------------------------------------------------------------------

  test('getDevice returns device when found', async () => {
    const row = { id: 'dev_1', userId: 'user_1', type: 'daemon', pushToken: null }
    mockPool.query.mockResolvedValue({ rows: [row] })

    const result = await registry.getDevice('dev_1')

    expect(result).toEqual(row)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM devices WHERE id'),
      ['dev_1']
    )
  })

  test('getDevice returns null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] })

    const result = await registry.getDevice('nonexistent')

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // getDevicesByUser
  // -------------------------------------------------------------------------

  test('getDevicesByUser returns all devices for a user', async () => {
    const rows = [
      { id: 'dev_1', type: 'daemon', pushToken: null, lastSeenAt: null },
      { id: 'dev_2', type: 'app', pushToken: 'expo_tok', lastSeenAt: new Date() }
    ]
    mockPool.query.mockResolvedValue({ rows })

    const result = await registry.getDevicesByUser('user_1')

    expect(result).toHaveLength(2)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id'),
      ['user_1']
    )
  })

  // -------------------------------------------------------------------------
  // touchDevice
  // -------------------------------------------------------------------------

  test('touchDevice updates last_seen_at', async () => {
    mockPool.query.mockResolvedValue({ rows: [] })

    await registry.touchDevice('dev_1')

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE devices SET last_seen_at'),
      ['dev_1']
    )
  })

  // -------------------------------------------------------------------------
  // updatePushToken
  // -------------------------------------------------------------------------

  test('updatePushToken updates push_token for device', async () => {
    mockPool.query.mockResolvedValue({ rows: [] })

    await registry.updatePushToken('dev_1', 'new_expo_token')

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE devices SET push_token'),
      ['dev_1', 'new_expo_token']
    )
  })

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  test('createSession inserts a session and returns the row', async () => {
    const row = { id: 'sess_1', userId: 'user_1', createdAt: new Date() }
    mockPool.query.mockResolvedValue({ rows: [row] })

    const result = await registry.createSession({
      id: 'sess_1',
      userId: 'user_1',
      metadata: { chain: 'ethereum' }
    })

    expect(result).toEqual(row)
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sessions'),
      ['sess_1', 'user_1', JSON.stringify({ chain: 'ethereum' })]
    )
  })

  test('getSession returns null when not found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] })

    const result = await registry.getSession('nonexistent')

    expect(result).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  test('close calls pool.end()', async () => {
    await registry.close()

    expect(mockPool.end).toHaveBeenCalled()
  })
})
