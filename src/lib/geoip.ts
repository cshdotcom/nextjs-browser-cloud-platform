// IP Geolocation utility.
// Provides a lightweight, self-contained IP→location lookup.
//
// In production, you would use a MaxMind GeoLite2 database or an IP API.
// Here we implement:
//   1. Private/internal IP detection (LAN, loopback, etc.)
//   2. A small built-in CIDR→country map for common cloud ranges (so the
//      demo has meaningful data even without an external DB)
//   3. A pluggable interface so an external GeoIP DB can be swapped in later.

export interface GeoInfo {
  country: string | null // ISO 3166-1 alpha-2 code (e.g. "US", "CN") or null
  countryName: string | null
  city: string | null
  region: string | null
  flag: string | null // emoji flag
  isPrivate: boolean
  asn: string | null // e.g. "AS13335 Cloudflare"
  source: 'builtin' | 'private' | 'unknown'
}

// Common cloud provider CIDR ranges → country (subset for demo purposes).
// In production, replace with MaxMind GeoLite2 Country/CSV.
const BUILTIN_RANGES: { cidr: string; country: string; countryName: string; asn: string }[] = [
  // AWS us-east-1 (partial)
  { cidr: '23.20.0.0/14', country: 'US', countryName: '美国', asn: 'AS14618 Amazon AWS' },
  { cidr: '50.16.0.0/15', country: 'US', countryName: '美国', asn: 'AS14618 Amazon AWS' },
  { cidr: '54.144.0.0/12', country: 'US', countryName: '美国', asn: 'AS14618 Amazon AWS' },
  { cidr: '3.0.0.0/9', country: 'US', countryName: '美国', asn: 'AS14618 Amazon AWS' },
  // AWS ap-northeast-1 (Tokyo)
  { cidr: '13.112.0.0/15', country: 'JP', countryName: '日本', asn: 'AS16509 Amazon AWS' },
  { cidr: '52.192.0.0/13', country: 'JP', countryName: '日本', asn: 'AS16509 Amazon AWS' },
  // AWS eu-west-1 (Ireland)
  { cidr: '34.240.0.0/13', country: 'IE', countryName: '爱尔兰', asn: 'AS16509 Amazon AWS' },
  { cidr: '54.72.0.0/13', country: 'IE', countryName: '爱尔兰', asn: 'AS16509 Amazon AWS' },
  // AWS cn-north-1 (Beijing)
  { cidr: '52.80.0.0/13', country: 'CN', countryName: '中国', asn: 'AS55990 Amazon CN' },
  // Alibaba Cloud China
  { cidr: '47.92.0.0/14', country: 'CN', countryName: '中国', asn: 'AS37963 Alibaba' },
  { cidr: '120.55.0.0/16', country: 'CN', countryName: '中国', asn: 'AS37963 Alibaba' },
  { cidr: '8.209.0.0/16', country: 'CN', countryName: '中国', asn: 'AS45102 Alibaba' },
  // Tencent Cloud
  { cidr: '129.226.0.0/16', country: 'CN', countryName: '中国', asn: 'AS45090 Tencent' },
  { cidr: '119.91.0.0/16', country: 'CN', countryName: '中国', asn: 'AS45090 Tencent' },
  // Google Cloud
  { cidr: '35.192.0.0/11', country: 'US', countryName: '美国', asn: 'AS396982 Google' },
  { cidr: '35.128.0.0/10', country: 'US', countryName: '美国', asn: 'AS396982 Google' },
  // Cloudflare
  { cidr: '104.16.0.0/13', country: 'US', countryName: '美国', asn: 'AS13335 Cloudflare' },
  { cidr: '172.64.0.0/13', country: 'US', countryName: '美国', asn: 'AS13335 Cloudflare' },
  // Microsoft Azure
  { cidr: '20.0.0.0/8', country: 'US', countryName: '美国', asn: 'AS8075 Microsoft' },
  { cidr: '40.64.0.0/10', country: 'US', countryName: '美国', asn: 'AS8075 Microsoft' },
  // DigitalOcean
  { cidr: '159.65.0.0/16', country: 'US', countryName: '美国', asn: 'AS14061 DigitalOcean' },
  { cidr: '165.22.0.0/16', country: 'US', countryName: '美国', asn: 'AS14061 DigitalOcean' },
  // Hetzner (Germany)
  { cidr: '116.203.0.0/16', country: 'DE', countryName: '德国', asn: 'AS24940 Hetzner' },
  { cidr: '159.69.0.0/16', country: 'DE', countryName: '德国', asn: 'AS24940 Hetzner' },
  // OVH (France)
  { cidr: '51.68.0.0/15', country: 'FR', countryName: '法国', asn: 'AS16276 OVH' },
  { cidr: '54.36.0.0/14', country: 'FR', countryName: '法国', asn: 'AS16276 OVH' },
  // Linode
  { cidr: '139.162.0.0/16', country: 'US', countryName: '美国', asn: 'AS63949 Linode' },
  // Vultr
  { cidr: '45.32.0.0/16', country: 'US', countryName: '美国', asn: 'AS20473 Vultr' },
  { cidr: '149.28.0.0/16', country: 'US', countryName: '美国', asn: 'AS20473 Vultr' },
]

// Compile CIDR ranges into numeric [start, end] for fast lookup
interface CompiledRange {
  start: number
  end: number
  country: string
  countryName: string
  asn: string
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

function cidrToRange(cidr: string): CompiledRange | null {
  const [ip, prefixStr] = cidr.split('/')
  if (!ip || !prefixStr) return null
  const prefix = parseInt(prefixStr)
  const int = ipToInt(ip)
  if (int == null || isNaN(prefix)) return null
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const start = (int & mask) >>> 0
  const end = (start | (~mask >>> 0)) >>> 0
  return { start, end, country: '', countryName: '', asn: '' }
}

const COMPILED: (CompiledRange & { country: string; countryName: string; asn: string })[] = BUILTIN_RANGES.map((r) => {
  const base = cidrToRange(r.cidr)!
  return { ...base, country: r.country, countryName: r.countryName, asn: r.asn }
}).filter(Boolean)

const PRIVATE_RANGES: CompiledRange[] = [
  { start: ipToInt('10.0.0.0')!, end: ipToInt('10.255.255.255')!, country: '', countryName: '', asn: '' },
  { start: ipToInt('172.16.0.0')!, end: ipToInt('172.31.255.255')!, country: '', countryName: '', asn: '' },
  { start: ipToInt('192.168.0.0')!, end: ipToInt('192.168.255.255')!, country: '', countryName: '', asn: '' },
  { start: ipToInt('127.0.0.0')!, end: ipToInt('127.255.255.255')!, country: '', countryName: '', asn: '' },
  { start: ipToInt('169.254.0.0')!, end: ipToInt('169.254.255.255')!, country: '', countryName: '', asn: '' },
  { start: ipToInt('100.64.0.0')!, end: ipToInt('100.127.255.255')!, country: '', countryName: '', asn: '' },
]

function isPrivateIp(int: number): boolean {
  return PRIVATE_RANGES.some((r) => int >= r.start && int <= r.end)
}

// Convert ISO country code to emoji flag
const COUNTRY_FLAG_OFFSET = 0x1f1e6
function countryCodeToFlag(cc: string | null): string | null {
  if (!cc || cc.length !== 2) return null
  const upper = cc.toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return null
  return String.fromCodePoint(
    COUNTRY_FLAG_OFFSET + (upper.charCodeAt(0) - 65),
    COUNTRY_FLAG_OFFSET + (upper.charCodeAt(1) - 65)
  )
}

export function lookupGeo(ip: string | null | undefined): GeoInfo {
  if (!ip || ip === 'unknown') {
    return { country: null, countryName: null, city: null, region: null, flag: null, isPrivate: false, asn: null, source: 'unknown' }
  }
  // Handle IPv6 loopback / mapped addresses
  if (ip === '::1' || ip === '::') {
    return {
      country: null,
      countryName: '内网',
      city: '本机',
      region: null,
      flag: '🔒',
      isPrivate: true,
      asn: null,
      source: 'private',
    }
  }
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) → extract IPv4
  let normalizedIp = ip
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) {
    normalizedIp = mapped[1]
  }
  const int = ipToInt(normalizedIp)
  if (int == null) {
    // IPv6 or invalid — return unknown
    return { country: null, countryName: null, city: null, region: null, flag: null, isPrivate: false, asn: null, source: 'unknown' }
  }
  if (isPrivateIp(int)) {
    return {
      country: null,
      countryName: '内网',
      city: '局域网',
      region: null,
      flag: '🔒',
      isPrivate: true,
      asn: null,
      source: 'private',
    }
  }
  for (const r of COMPILED) {
    if (int >= r.start && int <= r.end) {
      return {
        country: r.country,
        countryName: r.countryName,
        city: null,
        region: null,
        flag: countryCodeToFlag(r.country),
        isPrivate: false,
        asn: r.asn,
        source: 'builtin',
      }
    }
  }
  return { country: null, countryName: null, city: null, region: null, flag: null, isPrivate: false, asn: null, source: 'unknown' }
}

// Helper: format a geo info into a short display string
export function formatGeo(geo: GeoInfo): string {
  if (geo.isPrivate) return '内网 · 局域网'
  if (geo.countryName) return geo.city ? `${geo.countryName} · ${geo.city}` : geo.countryName
  return '未知地区'
}

// Helper: format IP + geo together
export function formatIpWithGeo(ip: string | null | undefined, geo?: GeoInfo): string {
  if (!ip || ip === 'unknown') return '未知 IP'
  const g = geo || lookupGeo(ip)
  const loc = formatGeo(g)
  return `${ip} (${loc})`
}
