export interface TrustRequest {
  headers: Record<string, string | string[] | undefined>
}

function value(headers: TrustRequest['headers'], name: string): string | undefined {
  const found = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(found) ? found[0] : found
}

function authority(raw: string): URL | undefined {
  try { return new URL(`http://${raw}`) } catch { return undefined }
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true
  return /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

export function isTrustedRequest(request: TrustRequest, trustedHosts: readonly string[] = []): boolean {
  const host = value(request.headers, 'host')
  if (!host) return false
  const parsed = authority(host)
  if (!parsed) return false
  const accepted = isLoopbackHostname(parsed.hostname) || trustedHosts.some((entry) => {
    const candidate = authority(entry)
    return candidate !== undefined && (candidate.hostname === parsed.hostname && (!candidate.port || candidate.port === parsed.port))
  })
  if (!accepted || value(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = value(request.headers, 'origin')
  if (!origin) return true
  try { return new URL(origin).host === parsed.host } catch { return false }
}

export function assertTrustedRequest(request: TrustRequest, trustedHosts: readonly string[] = []): void {
  if (!isTrustedRequest(request, trustedHosts)) throw new Error('request rejected by trust fence')
}
