/**
 * Daemon self-register + login flow.
 *
 * 1. Try login
 * 2. If 401 → register (self-register) → retry login
 * 3. Return JWT token on success, throw on failure
 */

interface Logger {
  info: (obj: Record<string, unknown>, msg: string) => void
  error: (obj: Record<string, unknown>, msg: string) => void
}

export async function authenticateWithRelay (
  relayHttpBase: string,
  daemonId: string,
  daemonSecret: string,
  logger: Logger,
): Promise<string> {
  const loginUrl = `${relayHttpBase}/api/auth/daemon/login`
  const loginBody = JSON.stringify({ daemonId, secret: daemonSecret })
  const headers = { 'Content-Type': 'application/json' }

  // 1. Try login
  const loginRes = await fetch(loginUrl, { method: 'POST', headers, body: loginBody })

  if (loginRes.ok) {
    const { token } = await loginRes.json() as { token: string }
    logger.info({ daemonId }, 'Daemon authenticated with relay')
    return token
  }

  // 2. Non-401 error → hard fail
  if (loginRes.status !== 401) {
    const body = await loginRes.text().catch(() => '')
    throw new Error(`Daemon login failed: ${loginRes.status} ${body}`.trim())
  }

  // 3. 401 → self-register attempt
  logger.info({ daemonId }, 'Daemon not registered, attempting self-register')

  const registerUrl = `${relayHttpBase}/api/auth/daemon/register`
  const registerBody = JSON.stringify({ daemonId, secret: daemonSecret })
  const registerRes = await fetch(registerUrl, { method: 'POST', headers, body: registerBody })

  if (registerRes.ok) {
    logger.info({ daemonId }, 'Daemon self-registered successfully')
  } else if (registerRes.status === 409) {
    logger.info({ daemonId }, 'Daemon already registered, retrying login')
  } else {
    logger.error({ daemonId, status: registerRes.status }, 'Daemon self-register failed')
    throw new Error(`Daemon self-register failed: ${registerRes.status}`)
  }

  // 4. Retry login after register
  const retryRes = await fetch(loginUrl, { method: 'POST', headers, body: loginBody })

  if (retryRes.ok) {
    const { token } = await retryRes.json() as { token: string }
    logger.info({ daemonId }, 'Daemon authenticated with relay')
    return token
  }

  const retryBody = await retryRes.text().catch(() => '')
  logger.error({ daemonId, status: retryRes.status }, 'Daemon login failed after register (likely wrong DAEMON_SECRET)')
  throw new Error(`Daemon login failed after register: ${retryRes.status} ${retryBody}`.trim())
}
