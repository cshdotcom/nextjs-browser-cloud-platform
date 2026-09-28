import 'server-only'
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { headers } from 'next/headers'
import { _registerTraceGetters } from '@/lib/errors'

/**
 * Request-scoped trace id holder.
 *
 * Lifecycle:
 *   1. middleware reads x-trace-id header (or generates a uuid v4) and
 *      forwards it via request headers to the Next.js handler.
 *   2. Route Handlers / Server Actions read it via `getTraceId(req)` or
 *      `getCurrentTraceId()`.
 *   3. `setTraceId(id)` runs the inner function inside an AsyncLocalStorage
 *      context so any descendant code (db helpers, audit logs, downstream
 *      fetch calls) can pull the trace id without threading it through every
 *      function signature.
 *
 * Every audit log / external API call / error response should include this
 * trace id so end-to-end requests can be correlated across systems.
 */

const TRACE_HEADER = 'x-trace-id'

// In-process AsyncLocalStorage for the trace id. Works across awaited calls
// within a single request. (Multi-instance horizontal scaling would require
// propagating this via headers to downstream services — already supported
// by getTraceHeader().)
const traceStorage = new AsyncLocalStorage<string>()

// ---------------- Generators ----------------
export function newTraceId(): string {
  return crypto.randomUUID()
}

/** Read the trace id from a Request (Route Handler) — header wins, else generate. */
export function getTraceId(req: Request): string {
  const hdr = req.headers.get(TRACE_HEADER)
  if (hdr && hdr.length > 0) return hdr
  return newTraceId()
}

/** Next.js next/headers() variant — for Server Actions / RSC. */
export async function getTraceIdFromHeaders(): Promise<string> {
  const h = await headers()
  const hdr = h.get(TRACE_HEADER)
  if (hdr && hdr.length > 0) return hdr
  // Fall back to AsyncLocalStorage if middleware didn't set the header
  const als = traceStorage.getStore()
  if (als) return als
  return newTraceId()
}

/** Convenience: alias for getTraceIdFromHeaders — typical Server Action entry. */
export const getServerActionTraceId = getTraceIdFromHeaders

// ---------------- Request-scoped setter ----------------
/**
 * Run `fn` inside a trace context. Any descendant async code can call
 * `getCurrentTraceId()` to obtain the id without explicit propagation.
 * Returns whatever `fn` returns.
 */
export async function setTraceId<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
  return traceStorage.run(traceId, fn)
}

/** Read the trace id from the current async context, if any. */
export function getCurrentTraceId(): string | undefined {
  return traceStorage.getStore()
}

/** Build a `{ 'x-trace-id': traceId }` object for outgoing fetch() calls. */
export function traceHeader(traceId?: string): Record<string, string> {
  const tid = traceId ?? getCurrentTraceId()
  return tid ? { [TRACE_HEADER]: tid } : {}
}

// ---------------- Errors.ts integration ----------------
// Wire errors.ts getters to this module so wrapHandler / wrapAction pick up
// the request-scoped trace id automatically. Runs once at module load.
_registerTraceGetters({
  getCurrent: () => getCurrentTraceId(),
  fromRequest: (req: Request) => getTraceId(req),
})

/** Convenience: set the trace header on an outgoing Response. */
export function withTraceHeader(res: Response, traceId?: string): Response {
  const tid = traceId ?? getCurrentTraceId()
  if (tid) res.headers.set(TRACE_HEADER, tid)
  return res
}

export { TRACE_HEADER as TRACE_ID_HEADER }
