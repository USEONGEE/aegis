/**
 * Compile-time type check fixture for send() overloads.
 *
 * This file is compiled by tsc --noEmit but never executed.
 * The overloads restrict channel types to 'chat' | 'control' | 'query_result'.
 * @ts-expect-error lines verify that unknown channel types are rejected.
 */

import type { RelayClient } from '../src/relay-client.js'

declare const client: RelayClient

// --- Valid calls (should compile) ---
client.send('chat', { type: 'typing', userId: 'u1', sessionId: 's1' }, 'u1')
client.send('control', { type: 'message_queued', userId: 'u1', sessionId: 's1', messageId: 'm1' })
client.send('query_result', { requestId: 'r1', status: 'ok', data: [] }, 'u1')

// --- Invalid calls (should fail to compile) ---

// @ts-expect-error — unknown channel type is rejected by overloads
client.send('banana', { data: 1 })
