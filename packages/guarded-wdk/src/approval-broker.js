'use strict'

import { ApprovalTimeoutError } from './errors.js'

class InMemoryApprovalBroker {
  constructor () {
    this._pending = new Map()
  }

  async request (req) {
    const ticket = {
      id: req.requestId,
      request: req,
      artifact: null,
      createdAt: Date.now()
    }
    this._pending.set(ticket.id, ticket)
    return ticket
  }

  grant (ticketId, artifact) {
    const ticket = this._pending.get(ticketId)
    if (!ticket) {
      throw new Error(`No pending ticket: ${ticketId}`)
    }
    ticket.artifact = artifact
  }

  async waitForApproval (ticketId, timeoutMs = 60000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ticket = this._pending.get(ticketId)
      if (!ticket) {
        throw new Error(`No pending ticket: ${ticketId}`)
      }
      if (ticket.artifact) {
        return ticket.artifact
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new ApprovalTimeoutError(ticketId)
  }

  consume (ticketId) {
    const ticket = this._pending.get(ticketId)
    if (!ticket) {
      throw new Error(`Ticket not found or already consumed: ${ticketId}`)
    }
    this._pending.delete(ticketId)
    return ticket.artifact
  }
}
