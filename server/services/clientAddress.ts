import { isIP } from 'node:net'
import { env } from '../env'

interface RequestIPSource {
  requestIP(request: Request): { address: string } | null
}

/**
 * The visitor's IP address: from env.CLIENT_IP_HEADER when the reverse proxy
 * set it (Railway: X-Real-IP), else the socket's peer. Null when neither is
 * known (requests handled with app.fetch, without a server).
 *
 * Only trust a header a proxy in front of the API overwrites: without one, a
 * client can send any value.
 */
export function clientAddress(request: Request, server: RequestIPSource | null): string | null {
  if (env.CLIENT_IP_HEADER) {
    // A list (X-Forwarded-For): the last entry is the one the closest proxy added
    const forwarded = request.headers.get(env.CLIENT_IP_HEADER)?.split(',').at(-1)?.trim()
    if (forwarded) return forwarded
  }
  return server?.requestIP(request)?.address ?? null
}

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

/**
 * The address a rate limit counts: IPv4 addresses as they are, IPv6 ones by
 * their /64 prefix, which a single host can usually draw addresses from at will.
 */
export function rateLimitAddress(ip: string): string {
  // Zone index (fe80::1%eth0)
  const address = ip.split('%')[0]
  const mapped = IPV4_MAPPED.exec(address)
  if (mapped) return mapped[1]
  if (isIP(address) !== 6) return address

  const [head, tail] = address.split('::')
  const groupsOf = (part: string | undefined) => (part ? part.split(':') : [])
  const headGroups = groupsOf(head)
  const tailGroups = groupsOf(tail)
  // An embedded IPv4 address (::1.2.3.4) fills the last two groups
  const size = (groups: string[]) => groups.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0)
  const elided = tail === undefined ? 0 : 8 - size(headGroups) - size(tailGroups)
  const groups = [...headGroups, ...Array<string>(elided).fill('0'), ...tailGroups]

  const prefix = groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16))
  return `${prefix.join(':')}::/64`
}
