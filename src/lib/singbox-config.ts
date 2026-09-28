import 'server-only'
import { ValidationError } from '@/lib/errors'

/**
 * Sing-Box config assembler (pure functions, in-memory only).
 *
 * Per the platform spec:
 *   - All Sing-Box JSON configs are assembled **in memory** by the NextJS
 *     backend. They are NEVER written to disk.
 *   - The assembled JSON is injected into the sing-box container via an
 *     environment variable (`SINGBOX_CONFIG`), and the container's
 *     entrypoint writes it to /etc/sing-box/config.json at startup.
 *
 * This module exposes:
 *   - assembleConfig(formData) — pure transform from the visual form model
 *     to a Sing-Box config object (validated against a structural schema).
 *   - validateConfig(config) — pre-flight syntax/structure check that runs
 *     BEFORE the config is sent to Docker. Throws ValidationError on issues.
 *
 * The form model intentionally mirrors the visual form layout described in
 * the spec: outbounds / inbounds / route / dns / transport. Each field is
 * a discriminated union so the TypeScript compiler enforces correctness at
 * the call site.
 *
 * Supported outbound types: vless / vmess / trojan / socks / http / direct
 * / block. Supported transports: tcp / ws / grpc / httpupgrade / reality.
 *
 * NOTE: This module does NOT call the Docker API. It only produces config
 * objects. docker-client.ts is responsible for shipping the assembled JSON
 * into the container.
 */

// ---------------- Types: form input ----------------

export type OutboundType = 'vless' | 'vmess' | 'trojan' | 'socks' | 'http' | 'direct' | 'block'
export type TransportType = 'tcp' | 'ws' | 'grpc' | 'httpupgrade' | 'quic' | 'http'

export interface VlessOutbound {
  type: 'vless'
  tag: string
  server: string
  server_port: number
  uuid: string
  flow?: string // e.g. xtls-rprx-vision
  network?: TransportType
  transport?: TransportConfig
  tls?: TlsConfig
}

export interface VmessOutbound {
  type: 'vmess'
  tag: string
  server: string
  server_port: number
  uuid: string
  security?: 'auto' | 'none' | 'zero' | 'aes-128-gcm' | 'chacha20-poly1305' | 'aes-128-ctr'
  alter_id?: number
  network?: TransportType
  transport?: TransportConfig
  tls?: TlsConfig
}

export interface TrojanOutbound {
  type: 'trojan'
  tag: string
  server: string
  server_port: number
  password: string
  network?: TransportType
  transport?: TransportConfig
  tls?: TlsConfig
}

export interface SocksOutbound {
  type: 'socks'
  tag: string
  server: string
  server_port: number
  username?: string
  password?: string
  version?: '4' | '4a' | '5'
  network?: TransportType
  transport?: TransportConfig
  tls?: TlsConfig
}

export interface HttpOutbound {
  type: 'http'
  tag: string
  server: string
  server_port: number
  username?: string
  password?: string
  tls?: TlsConfig
}

export interface DirectOutbound {
  type: 'direct'
  tag: string
  override_address?: string
  override_port?: number
}

export interface BlockOutbound {
  type: 'block'
  tag: string
  method?: 'default' | 'reset'
}

export type Outbound =
  | VlessOutbound
  | VmessOutbound
  | TrojanOutbound
  | SocksOutbound
  | HttpOutbound
  | DirectOutbound
  | BlockOutbound

export interface TransportConfig {
  type: TransportType
  // ws
  path?: string
  headers?: Record<string, string>
  // grpc
  service_name?: string
  // httpupgrade
  host?: string
  // quic / generic
  max_idle_connections?: number
  idle_timeout?: string
}

export interface TlsConfig {
  enabled: boolean
  server_name?: string
  insecure?: boolean
  alpn?: string[]
  min_version?: string
  max_version?: string
  cipher_suites?: string[]
  reality?: {
    enabled: boolean
    public_key: string
    short_id?: string
  }
  utls?: {
    enabled: boolean
    fingerprint?: string
  }
}

// Inbound
export type InboundType = 'socks' | 'http' | 'mixed' | 'tun' | 'redirect'

export interface SocksInbound {
  type: 'socks'
  tag: string
  listen: string
  listen_port: number
  users?: Array<{ username: string; password: string }>
  sniff?: boolean
  sniff_override_destination?: boolean
}

export interface HttpInbound {
  type: 'http'
  tag: string
  listen: string
  listen_port: number
  users?: Array<{ username: string; password: string }>
  sniff?: boolean
}

export interface MixedInbound {
  type: 'mixed'
  tag: string
  listen: string
  listen_port: number
  users?: Array<{ username: string; password: string }>
  sniff?: boolean
  sniff_override_destination?: boolean
}

export interface TunInbound {
  type: 'tun'
  tag: string
  interface_name?: string
  address?: string[]
  mtu?: number
  auto_route?: boolean
  strict_route?: boolean
  stack?: 'gvisor' | 'system'
}

export type Inbound = SocksInbound | HttpInbound | MixedInbound | TunInbound

// DNS
export interface DnsServerConfig {
  tag: string
  address: string
  detour?: string
}

export interface DnsRule {
  server?: string
  domain?: string[]
  domain_suffix?: string[]
  geosite?: string[]
  outbound?: string[]
}

export interface DnsConfig {
  servers: DnsServerConfig[]
  rules?: DnsRule[]
  final?: string
  strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only'
  disable_cache?: boolean
  disable_expire?: boolean
  independent_cache?: boolean
  client_subnet?: string
}

// Route
export interface RouteRule {
  inbound?: string[]
  protocol?: string[]
  domain?: string[]
  domain_suffix?: string[]
  domain_keyword?: string[]
  domain_regex?: string[]
  geosite?: string[]
  source_ip_cidr?: string[]
  ip_cidr?: string[]
  source_port?: number[]
  port?: number[]
  network?: 'tcp' | 'udp'
  outbound: string
  type?: 'logical'
  mode?: 'and' | 'or'
  rules?: RouteRule[]
}

export interface RouteConfig {
  rules: RouteRule[]
  final?: string
  auto_detect_interface?: boolean
  default_mark?: number
}

// Top-level form model
export interface SingBoxFormConfig {
  log?: {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'panic'
    timestamp?: boolean
  }
  dns?: DnsConfig
  inbounds: Inbound[]
  outbounds: Outbound[]
  route?: RouteConfig
  experimental?: Record<string, unknown>
}

// ---------------- Assembler ----------------

/**
 * Assemble a validated Sing-Box JSON config from the visual form model.
 *
 * Transformations:
 *   - Drops `tls.enabled` flag and emits TLS only when enabled=true
 *   - Drops `tls.reality` / `tls.utls` when their nested enabled flag is false
 *   - Strips undefined keys (so the JSON output is clean)
 *   - Adds default `outbounds` entries: 'direct' + 'block' if not provided
 *   - Adds default `route.final` if missing
 *   - Adds default `log.level = 'info'`
 *
 * Returns a plain object suitable for `JSON.stringify(config)`.
 */
export function assembleConfig(form: SingBoxFormConfig): Record<string, unknown> {
  validateForm(form)

  const outbounds = form.outbounds.map(transformOutbound).filter((o) => o !== null)

  // Ensure default outbounds exist
  if (!outbounds.some((o) => o.tag === 'direct')) {
    outbounds.push({ type: 'direct', tag: 'direct' })
  }
  if (!outbounds.some((o) => o.tag === 'block')) {
    outbounds.push({ type: 'block', tag: 'block' })
  }

  const inbounds = form.inbounds.map(transformInbound)

  const config: Record<string, unknown> = {
    log: {
      level: form.log?.level ?? 'info',
      timestamp: form.log?.timestamp ?? true,
    },
    inbounds,
    outbounds,
  }

  if (form.dns) {
    config.dns = transformDns(form.dns)
  }
  if (form.route) {
    config.route = transformRoute(form.route, outbounds)
  } else {
    config.route = {
      final: 'direct',
      auto_detect_interface: true,
      rules: [],
    }
  }
  if (form.experimental) {
    config.experimental = form.experimental
  }
  return config
}

// ---------------- Per-component transformers ----------------

function transformOutbound(o: Outbound): Record<string, unknown> | null {
  switch (o.type) {
    case 'direct':
    case 'block': {
      const out: Record<string, unknown> = { type: o.type, tag: o.tag }
      if (o.type === 'direct') {
        if ('override_address' in o && o.override_address) out.override_address = o.override_address
        if ('override_port' in o && o.override_port) out.override_port = o.override_port
      }
      if (o.type === 'block' && 'method' in o && o.method) out.method = o.method
      return out
    }
    case 'vless':
    case 'vmess':
    case 'trojan':
    case 'socks':
    case 'http': {
      const out: Record<string, unknown> = {
        type: o.type,
        tag: o.tag,
        server: o.server,
        server_port: o.server_port,
      }
      if (o.type === 'vless') {
        const v = o as VlessOutbound
        out.uuid = v.uuid
        if (v.flow) out.flow = v.flow
      } else if (o.type === 'vmess') {
        const v = o as VmessOutbound
        out.uuid = v.uuid
        if (v.security) out.security = v.security
        if (v.alter_id !== undefined) out.alter_id = v.alter_id
      } else if (o.type === 'trojan') {
        const v = o as TrojanOutbound
        out.password = v.password
      } else if (o.type === 'socks' || o.type === 'http') {
        const v = o as SocksOutbound | HttpOutbound
        if (v.username) out.username = v.username
        if (v.password) out.password = v.password
        if (o.type === 'socks' && 'version' in v && v.version) out.version = v.version
      }
      // Transport
      if ('transport' in o && o.transport) {
        out.transport = transformTransport(o.transport)
      } else if ('network' in o && o.network && o.network !== 'tcp') {
        // Backwards-compat: bare network field implies a transport wrapper
        out.transport = { type: o.network }
      }
      // TLS
      if ('tls' in o && o.tls && o.tls.enabled) {
        out.tls = transformTls(o.tls)
      }
      return out
    }
    default:
      return null
  }
}

function transformTransport(t: TransportConfig): Record<string, unknown> {
  const out: Record<string, unknown> = { type: t.type }
  switch (t.type) {
    case 'ws':
    case 'httpupgrade':
      if (t.path) out.path = t.path
      if (t.headers && Object.keys(t.headers).length > 0) out.headers = t.headers
      if (t.host) out.host = t.host
      break
    case 'grpc':
      if (t.service_name) out.service_name = t.service_name
      break
    case 'http':
      if (t.host) out.host = t.host
      if (t.path) out.path = t.path
      if (t.headers && Object.keys(t.headers).length > 0) out.headers = t.headers
      break
    case 'quic':
      // quic has no extra fields beyond type
      break
    case 'tcp':
      // tcp has no extra fields
      break
  }
  if (t.max_idle_connections !== undefined) out.max_idle_connections = t.max_idle_connections
  if (t.idle_timeout) out.idle_timeout = t.idle_timeout
  return out
}

function transformTls(t: TlsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (t.server_name) out.server_name = t.server_name
  if (t.insecure) out.insecure = true
  if (t.alpn && t.alpn.length > 0) out.alpn = t.alpn
  if (t.min_version) out.min_version = t.min_version
  if (t.max_version) out.max_version = t.max_version
  if (t.cipher_suites && t.cipher_suites.length > 0) out.cipher_suites = t.cipher_suites
  if (t.reality && t.reality.enabled) {
    out.reality = {
      enabled: true,
      public_key: t.reality.public_key,
      ...(t.reality.short_id ? { short_id: t.reality.short_id } : {}),
    }
  }
  if (t.utls && t.utls.enabled) {
    out.utls = {
      enabled: true,
      fingerprint: t.utls.fingerprint ?? 'chrome',
    }
  }
  return out
}

function transformInbound(i: Inbound): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: i.type,
    tag: i.tag,
  }
  if (i.type === 'tun') {
    const t = i as TunInbound
    if (t.interface_name) out.interface_name = t.interface_name
    if (t.address) out.address = t.address
    if (t.mtu) out.mtu = t.mtu
    if (t.auto_route !== undefined) out.auto_route = t.auto_route
    if (t.strict_route !== undefined) out.strict_route = t.strict_route
    if (t.stack) out.stack = t.stack
  } else {
    const s = i as SocksInbound | HttpInbound | MixedInbound
    out.listen = s.listen
    out.listen_port = s.listen_port
    if ('sniff' in s && s.sniff !== undefined) out.sniff = s.sniff
    if ('sniff_override_destination' in s && s.sniff_override_destination !== undefined) {
      out.sniff_override_destination = s.sniff_override_destination
    }
    if (s.users && s.users.length > 0) {
      out.users = s.users.map((u) => ({
        username: u.username,
        password: u.password,
      }))
    }
  }
  return out
}

function transformDns(d: DnsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {
    servers: d.servers.map((s) => {
      const o: Record<string, unknown> = { tag: s.tag, address: s.address }
      if (s.detour) o.detour = s.detour
      return o
    }),
  }
  if (d.rules && d.rules.length > 0) {
    out.rules = d.rules.map((r) => {
      const o: Record<string, unknown> = {}
      if (r.server) o.server = r.server
      if (r.domain) o.domain = r.domain
      if (r.domain_suffix) o.domain_suffix = r.domain_suffix
      if (r.geosite) o.geosite = r.geosite
      if (r.outbound) o.outbound = r.outbound
      return o
    })
  }
  if (d.final) out.final = d.final
  if (d.strategy) out.strategy = d.strategy
  if (d.disable_cache !== undefined) out.disable_cache = d.disable_cache
  if (d.disable_expire !== undefined) out.disable_expire = d.disable_expire
  if (d.independent_cache !== undefined) out.independent_cache = d.independent_cache
  if (d.client_subnet) out.client_subnet = d.client_subnet
  return out
}

function transformRoute(r: RouteConfig, outbounds: Array<Record<string, unknown>>): Record<string, unknown> {
  const validTags = new Set<string>(
    outbounds.map((o) => (typeof o.tag === 'string' ? o.tag : '')).filter((t) => t.length > 0),
  )
  const final = r.final && validTags.has(r.final) ? r.final : 'direct'

  const rules = r.rules.map((rule) => transformRouteRule(rule, validTags)).filter((x): x is Record<string, unknown> => x !== null)

  const out: Record<string, unknown> = {
    rules,
    final,
  }
  if (r.auto_detect_interface !== undefined) out.auto_detect_interface = r.auto_detect_interface
  if (r.default_mark !== undefined) out.default_mark = r.default_mark
  return out
}

function transformRouteRule(rule: RouteRule, validTags: Set<string>): Record<string, unknown> | null {
  if (!validTags.has(rule.outbound)) {
    throw new ValidationError(`路由规则引用了不存在的 outbound: ${rule.outbound}`, {
      code: 'VALIDATION_FAILED',
      data: { outbound: rule.outbound, validTags: Array.from(validTags) },
    })
  }
  if (rule.type === 'logical') {
    if (!rule.mode || !rule.rules || rule.rules.length === 0) {
      throw new ValidationError('logical 路由规则必须包含 mode 与 rules', { code: 'VALIDATION_FAILED' })
    }
    return {
      type: 'logical',
      mode: rule.mode,
      rules: rule.rules.map((r) => transformRouteRule(r, validTags)).filter((x) => x !== null),
      outbound: rule.outbound,
    }
  }
  const out: Record<string, unknown> = { outbound: rule.outbound }
  if (rule.inbound && rule.inbound.length > 0) out.inbound = rule.inbound
  if (rule.protocol && rule.protocol.length > 0) out.protocol = rule.protocol
  if (rule.domain && rule.domain.length > 0) out.domain = rule.domain
  if (rule.domain_suffix && rule.domain_suffix.length > 0) out.domain_suffix = rule.domain_suffix
  if (rule.domain_keyword && rule.domain_keyword.length > 0) out.domain_keyword = rule.domain_keyword
  if (rule.domain_regex && rule.domain_regex.length > 0) out.domain_regex = rule.domain_regex
  if (rule.geosite && rule.geosite.length > 0) out.geosite = rule.geosite
  if (rule.source_ip_cidr && rule.source_ip_cidr.length > 0) out.source_ip_cidr = rule.source_ip_cidr
  if (rule.ip_cidr && rule.ip_cidr.length > 0) out.ip_cidr = rule.ip_cidr
  if (rule.source_port && rule.source_port.length > 0) out.source_port = rule.source_port
  if (rule.port && rule.port.length > 0) out.port = rule.port
  if (rule.network) out.network = rule.network
  return out
}

// ---------------- Validation ----------------

/**
 * Pre-flight structural validation. Catches obvious typos / missing
 * required fields BEFORE the config is shipped to Docker.
 *
 * This is NOT a full Sing-Box schema validator — the canonical check is
 * `sing-box check -c config.json` run inside the container. This function
 * is the cheap first-pass that catches ~90% of mistakes at API entry time.
 */
export function validateConfig(config: unknown): asserts config is Record<string, unknown> {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Sing-Box 配置必须是一个对象', { code: 'VALIDATION_FAILED' })
  }
  const c = config as Record<string, unknown>
  if (!Array.isArray(c.inbounds) || c.inbounds.length === 0) {
    throw new ValidationError('Sing-Box 配置必须包含至少一个 inbound', { code: 'VALIDATION_FAILED' })
  }
  if (!Array.isArray(c.outbounds) || c.outbounds.length === 0) {
    throw new ValidationError('Sing-Box 配置必须包含至少一个 outbound', { code: 'VALIDATION_FAILED' })
  }

  const tags = new Set<string>()
  for (const o of c.outbounds as Array<Record<string, unknown>>) {
    if (!o.tag || typeof o.tag !== 'string') {
      throw new ValidationError('每个 outbound 必须有 tag', { code: 'VALIDATION_FAILED' })
    }
    if (tags.has(o.tag)) {
      throw new ValidationError(`outbound tag 重复: ${o.tag}`, { code: 'VALIDATION_FAILED' })
    }
    tags.add(o.tag)
    if (!o.type || typeof o.type !== 'string') {
      throw new ValidationError(`outbound ${o.tag} 缺少 type`, { code: 'VALIDATION_FAILED' })
    }
  }

  // Route rules reference must exist
  if (c.route && typeof c.route === 'object') {
    const r = c.route as { rules?: Array<Record<string, unknown>>; final?: string }
    if (Array.isArray(r.rules)) {
      for (const rule of r.rules) {
        const out = rule.outbound
        if (typeof out !== 'string' || !tags.has(out)) {
          throw new ValidationError(`路由规则引用了不存在的 outbound: ${out}`, {
            code: 'VALIDATION_FAILED',
            data: { outbound: out },
          })
        }
      }
    }
    if (r.final && !tags.has(r.final)) {
      throw new ValidationError(`route.final 引用了不存在的 outbound: ${r.final}`, {
        code: 'VALIDATION_FAILED',
      })
    }
  }
}

/** Validate the form input before assembly. */
function validateForm(form: SingBoxFormConfig): void {
  if (!form || typeof form !== 'object') {
    throw new ValidationError('表单输入无效', { code: 'VALIDATION_FAILED' })
  }
  if (!Array.isArray(form.inbounds) || form.inbounds.length === 0) {
    throw new ValidationError('必须配置至少一个 inbound', { code: 'VALIDATION_FAILED' })
  }
  if (!Array.isArray(form.outbounds) || form.outbounds.length === 0) {
    throw new ValidationError('必须配置至少一个 outbound', { code: 'VALIDATION_FAILED' })
  }
  const tags = new Set<string>()
  for (const o of form.outbounds) {
    if (!o.tag) {
      throw new ValidationError('每个 outbound 必须有 tag', { code: 'VALIDATION_FAILED' })
    }
    if (tags.has(o.tag)) {
      throw new ValidationError(`outbound tag 重复: ${o.tag}`, { code: 'VALIDATION_FAILED' })
    }
    tags.add(o.tag)
    if ('server' in o && !o.server) {
      throw new ValidationError(`outbound ${o.tag} 缺少 server`, { code: 'VALIDATION_FAILED' })
    }
    if ('server_port' in o && (!o.server_port || o.server_port <= 0 || o.server_port > 65535)) {
      throw new ValidationError(`outbound ${o.tag} 端口无效`, { code: 'VALIDATION_FAILED' })
    }
    if ('uuid' in o && !o.uuid) {
      throw new ValidationError(`outbound ${o.tag} 缺少 uuid`, { code: 'VALIDATION_FAILED' })
    }
    if ('password' in o && !o.password) {
      throw new ValidationError(`outbound ${o.tag} 缺少 password`, { code: 'VALIDATION_FAILED' })
    }
  }
  // Inbound tag uniqueness
  const inTags = new Set<string>()
  for (const i of form.inbounds) {
    if (!i.tag) {
      throw new ValidationError('每个 inbound 必须有 tag', { code: 'VALIDATION_FAILED' })
    }
    if (inTags.has(i.tag)) {
      throw new ValidationError(`inbound tag 重复: ${i.tag}`, { code: 'VALIDATION_FAILED' })
    }
    inTags.add(i.tag)
    if ('listen_port' in i && (i.listen_port <= 0 || i.listen_port > 65535)) {
      throw new ValidationError(`inbound ${i.tag} 端口无效`, { code: 'VALIDATION_FAILED' })
    }
  }
}

/** Convenience: assemble + validate in one call. Returns the JSON string. */
export function assembleAndStringify(form: SingBoxFormConfig): string {
  const config = assembleConfig(form)
  validateConfig(config)
  return JSON.stringify(config, null, 2)
}
