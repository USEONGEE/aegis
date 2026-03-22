import { Expo } from 'expo-server-sdk'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PushResultOk {
  ok: true
  ticketId: string
}

interface PushResultFailed {
  ok: false
  error: string
}

type PushResult = PushResultOk | PushResultFailed

interface PushBody {
  token: string
  title: string
  body: string
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Push notification helper
// ---------------------------------------------------------------------------

const expo = new Expo()

/**
 * Send a push notification to an Expo push token.
 *
 * The Relay uses this to wake up the RN App when an approval request or
 * new chat message arrives and the app is in background / killed.
 */
export async function sendPushNotification (
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<PushResult> {
  if (!Expo.isExpoPushToken(expoPushToken)) {
    return { ok: false, error: `Invalid Expo push token: ${expoPushToken}` }
  }

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([
      {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'wdk-relay',
      },
    ])

    if (ticket.status === 'ok') {
      return { ok: true, ticketId: ticket.id }
    }

    // ticket.status === 'error'
    const errorTicket = ticket as { message?: string; details?: { error?: string } }
    return { ok: false, error: errorTicket.message || errorTicket.details?.error || 'unknown' }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fastify route plugin -- POST /push/send
 *
 * Internal endpoint used by the WebSocket handler to trigger push
 * notifications when the target device is not connected via WS.
 *
 * Body: { token, title, body, data? }
 */
export default async function pushRoutes (fastify: FastifyInstance): Promise<void> {
  fastify.post('/push/send', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'title', 'body'],
        properties: {
          token: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: PushBody }>, reply: FastifyReply) => {
    const { token, title, body, data } = request.body
    const result = await sendPushNotification(token, title, body, data)

    if (!result.ok) {
      return reply.code(400).send(result)
    }

    return reply.send(result)
  })
}
