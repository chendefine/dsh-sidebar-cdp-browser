import { describe, expect, it } from 'vitest'
import { createTicketRegistry } from '../src/routes/http.ts'
import { parseClientRequest } from '../src/cdp/protocol.ts'

describe('CDP protocol seam', () => {
  it('issues single-use tickets with bounded claims', () => {
    const registry = createTicketRegistry(1_000, () => 10_000)
    const value = { sessionId: 'session-1', mode: 'observe' as const }
    const issued = registry.issue(value)
    expect(registry.consume(issued.ticket)).toEqual({ ...value, issuedAt: 10_000, expiresAt: 11_000 })
    expect(registry.consume(issued.ticket)).toBeUndefined()
  })

  it('rejects arbitrary CDP method passthrough', () => {
    expect(() => parseClientRequest({ v: 1, type: 'command', requestId: 'r1', method: 'Runtime.evaluate' })).toThrow()
  })

  it('accepts a versioned target-list request', () => {
    expect(parseClientRequest({ v: 1, type: 'targets.list', requestId: 'r1' })).toEqual({ v: 1, type: 'targets.list', requestId: 'r1' })
  })

  it('accepts target lifecycle requests (create/close) without extra fields', () => {
    expect(parseClientRequest({ v: 1, type: 'targets.create', requestId: 'r1' })).toEqual({ v: 1, type: 'targets.create', requestId: 'r1' })
    expect(parseClientRequest({ v: 1, type: 'target.close', requestId: 'r1', targetKey: 'k'.repeat(16) }))
      .toEqual({ v: 1, type: 'target.close', requestId: 'r1', targetKey: 'k'.repeat(16) })
    // No passthrough surface: a close with a smuggled method payload is refused.
    expect(() => parseClientRequest({ v: 1, type: 'target.close', requestId: 'r1', targetKey: 'k'.repeat(16), method: 'Browser.close' })).toThrow()
  })
})
