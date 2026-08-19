import { describe, expect, it } from 'vitest'
import { DEFAULT_CDP_ENDPOINT, normalizeCdpEndpoint, resolveCdpLiveConfig } from '../src/config.ts'
import { createTicketRegistry } from '../src/routes/http.ts'
import { isTrustedRequest } from '../src/trust-fence.ts'

describe('CDP live security boundary', () => {
  it('accepts same-origin loopback and rejects cross-site markers', () => {
    expect(isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': 'same-origin' } })).toBe(true)
    expect(isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).toBe(false)
  })

  it('accepts an explicitly trusted authority only with matching origin', () => {
    expect(isTrustedRequest({ headers: { host: 'dsh.example:3080', origin: 'http://dsh.example:3080' } }, ['dsh.example:3080'])).toBe(true)
    expect(isTrustedRequest({ headers: { host: 'dsh.example:3080', origin: 'https://other.example' } }, ['dsh.example:3080'])).toBe(false)
  })

  it('expires and consumes tickets exactly once', () => {
    let now = 1_000
    const tickets = createTicketRegistry(100, () => now)
    const issued = tickets.issue({ sessionId: 's1', mode: 'observe' })
    expect(tickets.consume(issued.ticket)?.sessionId).toBe('s1')
    expect(tickets.consume(issued.ticket)).toBeUndefined()
    const second = tickets.issue({ sessionId: 's1', mode: 'observe' })
    now = 1_101
    expect(tickets.consume(second.ticket)).toBeUndefined()
  })

  it('normalizes the single UI endpoint with a default fallback', () => {
    // Empty (or non-string) falls back to the default loopback address.
    expect(normalizeCdpEndpoint('')).toBe(DEFAULT_CDP_ENDPOINT)
    expect(normalizeCdpEndpoint('   ')).toBe(DEFAULT_CDP_ENDPOINT)
    expect(normalizeCdpEndpoint(undefined)).toBe(DEFAULT_CDP_ENDPOINT)
    expect(normalizeCdpEndpoint(42)).toBe(DEFAULT_CDP_ENDPOINT)
    // Bare host:port gets an http:// scheme; whitespace is trimmed.
    expect(normalizeCdpEndpoint('127.0.0.1:9222')).toBe('http://127.0.0.1:9222/')
    expect(normalizeCdpEndpoint(' 192.168.1.10:9223 ')).toBe('http://192.168.1.10:9223/')
    // Full URLs pass through unchanged; remote hosts are fully allowed.
    expect(normalizeCdpEndpoint('http://192.168.254.200:9223')).toBe('http://192.168.254.200:9223/')
    expect(normalizeCdpEndpoint('wss://cdp.example.com/proxy')).toBe('wss://cdp.example.com/proxy')
    // Unsupported schemes and credentials are rejected.
    expect(() => normalizeCdpEndpoint('ftp://127.0.0.1:9222')).toThrow(/unsupported/i)
    expect(() => normalizeCdpEndpoint('http://user:pass@127.0.0.1:9222')).toThrow(/credentials/i)
    expect(() => normalizeCdpEndpoint('not a url')).toThrow(/invalid/i)
  })

  it('rejects invalid frame limits', () => {
    expect(() => resolveCdpLiveConfig({ bufferedAmountSoftLimit: 1024 * 1024, bufferedAmountHardLimit: 512 * 1024 })).toThrow(/greater/i)
  })
})
