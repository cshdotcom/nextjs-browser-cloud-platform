import 'server-only'

/**
 * In-process WebSocket event bus.
 *
 * This is NOT a WebSocket server itself. The actual WS server (running in a
 * mini-service or co-located in the Next.js process) bridges between TCP
 * sockets and this in-process pub/sub:
 *
 *       ┌──────────────────┐  publish()  ┌────────────────────┐
 *       │  NextJS Server   │ ──────────► │  In-process Bus     │
 *       │  (Route Handler  │             │  (this module)       │
 *       │   / Server Action│             │                      │
 *       │   / RSC)         │             │  │ broadcast to       │
 *       └──────────────────┘             │  │ all subscribers    │
 *                                        │  ▼                    │
 *                                        │  ┌────────────────┐  │
 *                                        │  │ WS mini-service │  │
 *                                        │  │  (subscribed)   │ ─┼──► user browsers
 *                                        │  └────────────────┘  │
 *                                        └────────────────────┘
 *
 * Subscriptions are keyed by (userId, groupId) so:
 *   - publish(userId, event)   → delivered to that user's subscribers (and
 *                                any group-scoped subscribers that opted
 *                                into the user's events).
 *   - publishGroup(groupId, event) → delivered to every group member's
 *                                subscribers.
 *
 * Subscribers receive a serialized WsEvent object. The WS mini-service is
 * expected to JSON.stringify it before sending over the socket.
 *
 * NOTE: This is a per-process bus. For multi-instance deployments, the
 * mini-service should subscribe to a Redis pub/sub channel and bridge events
 * across instances. The interface here doesn't change.
 */

// ---------------- Event types ----------------
export type WsEventType =
  | 'workspace.created'
  | 'workspace.updated'
  | 'workspace.closed'
  | 'workspace.stats'
  | 'workspace.log'
  | 'singbox.created'
  | 'singbox.updated'
  | 'singbox.state_changed'
  | 'singbox.stats'
  | 'singbox.log'
  | 'proxy.updated'
  | 'user.updated'
  | 'group.updated'
  | 'system.alert'
  | 'system.config_changed'
  | 'system.maintenance'
  | string // allow ad-hoc types

export interface WsEvent<T = unknown> {
  /** Event type discriminator. */
  type: WsEventType
  /** Event payload, any JSON-serializable shape. */
  payload: T
  /** Trace id propagated from the originating request, when available. */
  traceId?: string
  /** Unix epoch milliseconds. Set by publish(). */
  ts: number
  /** Optional scope hint: 'user' | 'group' | 'system'. */
  scope?: 'user' | 'group' | 'system'
}

export type WsCallback = (event: WsEvent) => void

interface Subscription {
  id: string
  userId?: string
  groupId?: string
  callback: WsCallback
}

// ---------------- Singleton bus ----------------
const subscriptions = new Map<string, Subscription>()
let subSeq = 0

/**
 * Subscribe to events for a user and/or group. Pass either userId, groupId,
 * or both. Pass `undefined` for both to subscribe to system-broadcast events.
 *
 * Returns an `unsubscribe()` function.
 */
export function subscribe(opts: {
  userId?: string
  groupId?: string
  callback: WsCallback
}): () => void {
  const id = `sub-${++subSeq}-${Date.now().toString(36)}`
  const sub: Subscription = {
    id,
    userId: opts.userId,
    groupId: opts.groupId,
    callback: opts.callback,
  }
  subscriptions.set(id, sub)
  return () => {
    subscriptions.delete(id)
  }
}

/**
 * Publish an event to a single user's subscribers.
 * Also delivers to:
 *   - subscribers in the user's group (if they subscribed to that group)
 *   - system-wide subscribers (those who passed neither userId nor groupId)
 */
export function publish(userId: string, event: WsEvent<unknown>): number {
  return deliver(event, { userId })
}

/**
 * Publish an event to a group's subscribers.
 * Also delivers to system-wide subscribers.
 */
export function publishGroup(groupId: string, event: WsEvent<unknown>): number {
  return deliver(event, { groupId })
}

/**
 * Broadcast an event to every subscriber. Use sparingly (e.g. maintenance
 * announcements).
 */
export function broadcast(event: WsEvent<unknown>): number {
  return deliver(event, {})
}

function deliver(event: WsEvent<unknown>, filter: { userId?: string; groupId?: string }): number {
  // Fill in ts + scope if missing
  const ev: WsEvent = {
    ...event,
    ts: event.ts ?? Date.now(),
  }
  if (!ev.scope) {
    ev.scope = filter.userId ? 'user' : filter.groupId ? 'group' : 'system'
  }
  let delivered = 0
  for (const sub of subscriptions.values()) {
    // System subscribers always receive
    if (!sub.userId && !sub.groupId) {
      try {
        sub.callback(ev)
        delivered++
      } catch (e) {
        console.error('[websocket] subscriber threw', e)
      }
      continue
    }
    // User-targeted event
    if (filter.userId && sub.userId === filter.userId) {
      try {
        sub.callback(ev)
        delivered++
      } catch (e) {
        console.error('[websocket] subscriber threw', e)
      }
      continue
    }
    // Group-targeted event
    if (filter.groupId && sub.groupId === filter.groupId) {
      try {
        sub.callback(ev)
        delivered++
      } catch (e) {
        console.error('[websocket] subscriber threw', e)
      }
      continue
    }
  }
  return delivered
}

/** Number of active subscribers (diagnostics only). */
export function subscriberCount(): number {
  return subscriptions.size
}

/** Drop all subscribers. Test-only / shutdown hook. */
export function clearAllSubscribers(): void {
  subscriptions.clear()
}

// ---------------- Convenience builders ----------------
export function buildEvent<T>(
  type: WsEventType,
  payload: T,
  opts: { traceId?: string; ts?: number; scope?: 'user' | 'group' | 'system' } = {},
): WsEvent<T> {
  return {
    type,
    payload,
    traceId: opts.traceId,
    ts: opts.ts ?? Date.now(),
    scope: opts.scope,
  }
}
