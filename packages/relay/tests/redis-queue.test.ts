import { jest } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock ioredis and config BEFORE importing RedisQueue
// ---------------------------------------------------------------------------

interface MockRedisInstance {
  xadd: jest.Mock
  xread: jest.Mock
  xack: jest.Mock
  xgroup: jest.Mock
  xreadgroup: jest.Mock
  xtrim: jest.Mock
  set: jest.Mock
  exists: jest.Mock
  disconnect: jest.Mock
}

const mockRedisInstance: MockRedisInstance = {
  xadd: jest.fn(),
  xread: jest.fn(),
  xack: jest.fn(),
  xgroup: jest.fn(),
  xreadgroup: jest.fn(),
  xtrim: jest.fn(),
  set: jest.fn(),
  exists: jest.fn(),
  disconnect: jest.fn()
}

// Each `new Redis()` call returns a fresh-ish mock; we track both connections
const mockRedisInstances: MockRedisInstance[] = []

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn().mockImplementation(() => {
    const instance = { ...mockRedisInstance } as MockRedisInstance
    // Give each instance its own jest.fn() copies
    for (const key of Object.keys(instance) as Array<keyof MockRedisInstance>) {
      instance[key] = jest.fn()
    }
    mockRedisInstances.push(instance)
    return instance
  })
}))

jest.unstable_mockModule('../src/config.js', () => ({
  default: {
    redis: { url: 'redis://localhost:6379' },
    streamMaxLen: 10000,
    streamBlockMs: 5000
  }
}))

const { RedisQueue } = await import('../src/queue/redis-queue.js')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RedisQueue', () => {
  let queue: InstanceType<typeof RedisQueue>

  beforeEach(() => {
    mockRedisInstances.length = 0
    queue = new RedisQueue({ url: 'redis://test:6379' })
  })

  afterEach(() => {
    queue.close()
  })

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  test('creates two Redis connections (writer + blocking reader)', () => {
    // The constructor calls `new Redis()` twice
    expect(mockRedisInstances).toHaveLength(2)
    expect(queue.redis).toBeDefined()
    expect(queue.blockingRedis).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // publish
  // -------------------------------------------------------------------------

  test('publish calls XADD with flattened fields and returns entry ID', async () => {
    ;(queue.redis.xadd as jest.Mock<any>).mockResolvedValue('1234567890-0')

    const id = await queue.publish('control:u1', { type: 'tx', data: '{}' })

    expect(id).toBe('1234567890-0')
    expect(queue.redis.xadd).toHaveBeenCalledWith(
      'control:u1',
      'MAXLEN', '~', 10000,
      '*',
      'type', 'tx',
      'data', '{}'
    )
  })

  test('publish stringifies non-string values', async () => {
    ;(queue.redis.xadd as jest.Mock<any>).mockResolvedValue('100-0')

    await queue.publish('stream:x', { count: 42, flag: true } as any)

    expect(queue.redis.xadd).toHaveBeenCalledWith(
      'stream:x',
      'MAXLEN', '~', 10000,
      '*',
      'count', '42',
      'flag', 'true'
    )
  })

  // -------------------------------------------------------------------------
  // consume
  // -------------------------------------------------------------------------

  test('consume returns parsed entries from XREAD', async () => {
    ;(queue.blockingRedis.xread as jest.Mock<any>).mockResolvedValue([
      ['stream:s1', [
        ['100-0', ['type', 'tx', 'amount', '500']],
        ['100-1', ['type', 'policy', 'chain', 'eth']]
      ]]
    ])

    const entries = await queue.consume('stream:s1', '0-0', 10)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ id: '100-0', data: { type: 'tx', amount: '500' } })
    expect(entries[1]).toEqual({ id: '100-1', data: { type: 'policy', chain: 'eth' } })
    expect(queue.blockingRedis.xread).toHaveBeenCalledWith(
      'COUNT', 10, 'BLOCK', 5000, 'STREAMS', 'stream:s1', '0-0'
    )
  })

  test('consume returns empty array when XREAD returns null', async () => {
    ;(queue.blockingRedis.xread as jest.Mock<any>).mockResolvedValue(null)

    const entries = await queue.consume('stream:empty', '$')

    expect(entries).toEqual([])
  })

  // -------------------------------------------------------------------------
  // ack
  // -------------------------------------------------------------------------

  test('ack calls XACK with stream, group, and id', async () => {
    ;(queue.redis.xack as jest.Mock<any>).mockResolvedValue(1)

    await queue.ack('stream:s1', 'grp1', '100-0')

    expect(queue.redis.xack).toHaveBeenCalledWith('stream:s1', 'grp1', '100-0')
  })

  // -------------------------------------------------------------------------
  // heartbeat helpers
  // -------------------------------------------------------------------------

  test('setWithTtl calls SET with EX', async () => {
    await queue.setWithTtl('online:u1', 30, '1')

    expect(queue.redis.set).toHaveBeenCalledWith('online:u1', '1', 'EX', 30)
  })

  test('exists returns boolean from EXISTS', async () => {
    ;(queue.redis.exists as jest.Mock<any>).mockResolvedValue(1)

    const result = await queue.exists('online:u1')

    expect(result).toBe(true)
    expect(queue.redis.exists).toHaveBeenCalledWith('online:u1')
  })

  test('exists returns false when key does not exist', async () => {
    ;(queue.redis.exists as jest.Mock<any>).mockResolvedValue(0)

    const result = await queue.exists('online:gone')

    expect(result).toBe(false)
  })

  // -------------------------------------------------------------------------
  // _fieldsToObject
  // -------------------------------------------------------------------------

  test('_fieldsToObject converts flat array to object', () => {
    const obj = RedisQueue._fieldsToObject(['a', '1', 'b', '2', 'c', '3'])

    expect(obj).toEqual({ a: '1', b: '2', c: '3' })
  })

  // -------------------------------------------------------------------------
  // ensureGroup
  // -------------------------------------------------------------------------

  test('ensureGroup ignores BUSYGROUP error', async () => {
    ;(queue.redis.xgroup as jest.Mock<any>).mockRejectedValue(new Error('BUSYGROUP group already exists') as never)

    // Should not throw
    await expect(queue.ensureGroup('stream:s1', 'grp1')).resolves.toBeUndefined()
  })

  test('ensureGroup rethrows non-BUSYGROUP errors', async () => {
    ;(queue.redis.xgroup as jest.Mock<any>).mockRejectedValue(new Error('Connection refused') as never)

    await expect(queue.ensureGroup('stream:s1', 'grp1')).rejects.toThrow('Connection refused')
  })

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------

  test('close disconnects both Redis connections', async () => {
    await queue.close()

    expect(queue.redis.disconnect).toHaveBeenCalled()
    expect(queue.blockingRedis.disconnect).toHaveBeenCalled()
  })
})
