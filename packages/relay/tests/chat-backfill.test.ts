import { jest } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock ioredis BEFORE importing RedisQueue
// ---------------------------------------------------------------------------

interface MockRedisInstance {
  xadd: jest.Mock
  xread: jest.Mock
  xrange: jest.Mock
  xack: jest.Mock
  xgroup: jest.Mock
  xreadgroup: jest.Mock
  xtrim: jest.Mock
  set: jest.Mock
  exists: jest.Mock
  disconnect: jest.Mock
}

const mockRedisInstances: MockRedisInstance[] = []

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn().mockImplementation(() => {
    const instance: MockRedisInstance = {
      xadd: jest.fn(),
      xread: jest.fn(),
      xrange: jest.fn(),
      xack: jest.fn(),
      xgroup: jest.fn(),
      xreadgroup: jest.fn(),
      xtrim: jest.fn(),
      set: jest.fn(),
      exists: jest.fn(),
      disconnect: jest.fn()
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

describe('RedisQueue.readRange (XRANGE for chat backfill)', () => {
  let queue: InstanceType<typeof RedisQueue>

  beforeEach(() => {
    mockRedisInstances.length = 0
    queue = new RedisQueue({ url: 'redis://test:6379' })
  })

  afterEach(() => {
    queue.close()
  })

  it('returns entries from XRANGE', async () => {
    ;(queue.redis.xrange as jest.Mock<any>).mockResolvedValueOnce([
      ['1-0', ['sender', 'daemon', 'payload', '{"type":"done","content":"hello"}', 'timestamp', '1000', 'sessionId', 'sess1']],
      ['2-0', ['sender', 'daemon', 'payload', '{"type":"stream","delta":"hi"}', 'timestamp', '2000', 'sessionId', 'sess1']]
    ])

    const entries = await queue.readRange('chat:user1:sess1', '0', '+', 1000)

    expect(queue.redis.xrange).toHaveBeenCalledWith('chat:user1:sess1', '0', '+', 'COUNT', 1000)
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe('1-0')
    expect(entries[0].data.sender).toBe('daemon')
    expect(entries[1].id).toBe('2-0')
  })

  it('returns empty array for non-existent stream', async () => {
    ;(queue.redis.xrange as jest.Mock<any>).mockResolvedValueOnce([])

    const entries = await queue.readRange('chat:user1:nonexistent', '0', '+', 1000)

    expect(entries).toHaveLength(0)
  })

  it('supports cursor-based start for authenticate backfill', async () => {
    ;(queue.redis.xrange as jest.Mock<any>).mockResolvedValueOnce([
      ['5-0', ['sender', 'daemon', 'payload', '{"type":"done"}', 'timestamp', '5000', 'sessionId', 'sess1']]
    ])

    const entries = await queue.readRange('chat:user1:sess1', '3-0', '+', 1000)

    expect(queue.redis.xrange).toHaveBeenCalledWith('chat:user1:sess1', '3-0', '+', 'COUNT', 1000)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('5-0')
  })
})
