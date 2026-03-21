import { jest } from '@jest/globals'
import { authenticateWithRelay } from '../src/relay-auth.js'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockLogger {
  info: jest.Mock
  error: jest.Mock
}

function createMockLogger (): MockLogger {
  return {
    info: jest.fn(),
    error: jest.fn(),
  }
}

type FetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<Record<string, unknown>>
  text: () => Promise<string>
}

function mockFetchResponses (...responses: FetchResponse[]) {
  let callIndex = 0
  return jest.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    const res = responses[callIndex++]
    return res as unknown as Response
  })
}

const BASE = 'http://relay:3000'
const DAEMON_ID = 'daemon-1'
const SECRET = 'my-secret-123'
const TOKEN = 'jwt-token-abc'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authenticateWithRelay', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // F4: Normal daemon — login 200 → token, no register
  it('returns token on login success without calling register', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: true, status: 200, json: async () => ({ token: TOKEN }), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    const token = await authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger)

    expect(token).toBe(TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/api/auth/daemon/login`)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ daemonId: DAEMON_ID }),
      expect.stringContaining('authenticated'),
    )
  })

  // F2: Unregistered daemon — login 401 → register 201 → login 200
  it('self-registers on 401 and retries login', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
      { ok: true, status: 201, json: async () => ({ daemonId: DAEMON_ID }), text: async () => '' },
      { ok: true, status: 200, json: async () => ({ token: TOKEN }), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    const token = await authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger)

    expect(token).toBe(TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // 1st: login, 2nd: register, 3rd: login retry
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/api/auth/daemon/login`)
    expect(fetchMock.mock.calls[1]![0]).toBe(`${BASE}/api/auth/daemon/register`)
    expect(fetchMock.mock.calls[2]![0]).toBe(`${BASE}/api/auth/daemon/login`)
    // L1: register success log
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ daemonId: DAEMON_ID }),
      expect.stringContaining('self-registered'),
    )
  })

  // F3: Wrong secret — login 401 → register 409 → login 401 → throw
  it('throws on wrong secret (409 + retry 401)', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
      { ok: false, status: 409, json: async () => ({}), text: async () => '' },
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    await expect(
      authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger),
    ).rejects.toThrow('login failed after register')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    // L2: wrong secret error log
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ daemonId: DAEMON_ID }),
      expect.stringContaining('wrong DAEMON_SECRET'),
    )
  })

  // F5: Concurrent registration — login 401 → register 409 → login 200
  it('handles concurrent registration (409 + retry 200)', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
      { ok: false, status: 409, json: async () => ({}), text: async () => '' },
      { ok: true, status: 200, json: async () => ({ token: TOKEN }), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    const token = await authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger)

    expect(token).toBe(TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ daemonId: DAEMON_ID }),
      expect.stringContaining('already registered'),
    )
  })

  // E1: register 5xx → throw
  it('throws on register 5xx', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
      { ok: false, status: 500, json: async () => ({}), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    await expect(
      authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger),
    ).rejects.toThrow('self-register failed: 500')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // L3: register failure log
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ daemonId: DAEMON_ID, status: 500 }),
      expect.stringContaining('self-register failed'),
    )
  })

  // E2: login non-401 error → no register, throw
  it('throws on login non-401 error without register', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 500, json: async () => ({}), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    await expect(
      authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger),
    ).rejects.toThrow('Daemon login failed: 500')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // E3: register 201 → login retry 500 → throw
  it('throws on login retry failure after successful register', async () => {
    const logger = createMockLogger()
    const fetchMock = mockFetchResponses(
      { ok: false, status: 401, json: async () => ({}), text: async () => '' },
      { ok: true, status: 201, json: async () => ({ daemonId: DAEMON_ID }), text: async () => '' },
      { ok: false, status: 500, json: async () => ({}), text: async () => '' },
    )
    globalThis.fetch = fetchMock

    await expect(
      authenticateWithRelay(BASE, DAEMON_ID, SECRET, logger),
    ).rejects.toThrow('login failed after register')

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
