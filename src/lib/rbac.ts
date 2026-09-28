import 'server-only'
import { db } from '@/lib/db'
import { PermissionError } from '@/lib/errors'

/**
 * Role-Based Access Control.
 *
 * Roles (mirrors User.role string column in Prisma):
 *   - superadmin : bypasses ALL permission checks
 *   - admin      : can manage most platform resources; bypasses ownership
 *                  checks but still subject to certain quotas / system configs
 *   - user       : default; can only act on resources they own or that their
 *                  group admins have explicitly granted
 *
 * Permissions:
 *   view | edit | delete | execute | share | export
 *
 * Resource types:
 *   user | group | workspace | singbox | proxy | template | token | config
 *   | file | alert
 *
 * Resolution order for `checkPermission(userId, resourceType, resourceId, action)`:
 *   1. Load user.role. If superadmin → allow.
 *   2. If user.role === 'admin' AND the resource type is admin-manageable
 *      (user/group/config/singbox/proxy/template/alert) → allow.
 *   3. Resource-type-specific resolver fetches the resource row and returns
 *      { ownerUserId?, groupId? }. If the user owns it OR is a group admin
 *      of the resource's group → allow.
 *   4. Otherwise → deny.
 *
 * Default-deny: when in doubt, deny. The `requirePermission(...)` variant
 * throws a PermissionError so Server Actions can early-return.
 *
 * Future resource tables (workspace/singbox/proxy/template/file/alert) are
 * registered lazily via `registerResourceResolver` so this file does not need
 * a hard Prisma dependency on every future model. Existing tables (user,
 * group) have built-in resolvers.
 */

export type Role = 'superadmin' | 'admin' | 'user'

export type Permission =
  | 'view'
  | 'edit'
  | 'delete'
  | 'execute'
  | 'share'
  | 'export'

export type ResourceType =
  | 'user'
  | 'group'
  | 'workspace'
  | 'singbox'
  | 'proxy'
  | 'template'
  | 'token'
  | 'config'
  | 'file'
  | 'alert'

/** Resource-types that admins can manage regardless of ownership. */
const ADMIN_MANAGED_TYPES: ReadonlySet<ResourceType> = new Set<ResourceType>([
  'user',
  'group',
  'config',
  'singbox',
  'proxy',
  'template',
  'alert',
])

/** Resources where a regular user can perform read/execute on their own. */
const USER_OWNABLE_TYPES: ReadonlySet<ResourceType> = new Set<ResourceType>([
  'workspace',
  'singbox',
  'proxy',
  'template',
  'token',
  'file',
  'alert',
])

// ---------------- Resource resolver registry ----------------
export interface ResourceInfo {
  ownerUserId?: string | null
  groupId?: string | null
}

export type ResourceResolver = (resourceId: string) => Promise<ResourceInfo | null>

const resolvers = new Map<ResourceType, ResourceResolver>()

/**
 * Register a resolver for a resource type. Future task tables (workspace,
 * singbox, proxy, etc.) should call this at their module load to plug in
 * their ownership lookup. Returns nothing.
 */
export function registerResourceResolver(type: ResourceType, resolver: ResourceResolver): void {
  resolvers.set(type, resolver)
}

// Built-in resolvers for tables that already exist in the Prisma schema.
registerResourceResolver('user', async (id) => {
  const u = await db.user.findUnique({ where: { id }, select: { id: true, groupId: true } })
  return u ? { ownerUserId: u.id, groupId: u.groupId } : null
})

registerResourceResolver('group', async (id) => {
  const g = await db.userGroup.findUnique({ where: { id }, select: { id: true } })
  return g ? { ownerUserId: null, groupId: g.id } : null
})

// ---------------- User context ----------------
interface UserCtx {
  id: string
  role: Role
  groupId: string | null
}

async function loadUserCtx(userId: string): Promise<UserCtx | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, groupId: true, status: true },
  })
  if (!u) return null
  // Treat suspended/disabled users as having no permission at all
  if (u.status !== 'active') return null
  return {
    id: u.id,
    role: (u.role as Role) ?? 'user',
    groupId: u.groupId ?? null,
  }
}

async function isGroupAdmin(userId: string, groupId: string | null | undefined): Promise<boolean> {
  if (!groupId) return false
  const g = await db.userGroup.findUnique({
    where: { id: groupId },
    select: { admins: true },
  })
  if (!g?.admins) return false
  try {
    const ids = JSON.parse(g.admins) as unknown
    return Array.isArray(ids) && ids.includes(userId)
  } catch {
    return false
  }
}

// ---------------- Core check ----------------
export interface CheckPermissionOpts {
  /** When the resolver can't fetch the resource row, allow caller to supply ownership inline. */
  ownerUserId?: string
  groupId?: string | null
  /** Optional audit reason for the deny case. */
  reason?: string
}

/**
 * Check whether `userId` can perform `action` on `resourceType` / `resourceId`.
 *
 * Returns `true` if allowed, `false` otherwise. Never throws for permission
 * failures — use `requirePermission(...)` for the throwing variant.
 */
export async function checkPermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: Permission,
  opts: CheckPermissionOpts = {},
): Promise<boolean> {
  const user = await loadUserCtx(userId)
  if (!user) return false

  // 1. Superadmin bypass
  if (user.role === 'superadmin') return true

  // 2. Admin manage-all check
  if (user.role === 'admin' && ADMIN_MANAGED_TYPES.has(resourceType)) {
    return true
  }

  // 3. Resolve resource ownership
  let info: ResourceInfo | null = null
  if (opts.ownerUserId !== undefined || opts.groupId !== undefined) {
    info = {
      ownerUserId: opts.ownerUserId ?? null,
      groupId: opts.groupId ?? null,
    }
  } else {
    const resolver = resolvers.get(resourceType)
    if (resolver) {
      try {
        info = await resolver(resourceId)
      } catch (e) {
        console.error(`[rbac] resolver for ${resourceType} threw`, e)
        return false
      }
    }
  }

  // 4. Ownership check (for user-ownable types)
  if (USER_OWNABLE_TYPES.has(resourceType) && info) {
    // User owns the resource
    if (info.ownerUserId && info.ownerUserId === userId) return true
    // User is a group admin of the resource's group
    if (info.groupId && (await isGroupAdmin(userId, info.groupId))) return true
    // User belongs to the same group AND action is read-only view
    if (info.groupId && info.groupId === user.groupId && action === 'view') return true
  }

  // 5. Group-scoped resources: group admins can manage group's resources
  if (resourceType === 'group' && info?.groupId) {
    if (await isGroupAdmin(userId, info.groupId)) return true
  }

  // 6. Special: a user can always view/edit/delete their own user row
  if (resourceType === 'user' && resourceId === userId) {
    if (action === 'view' || action === 'edit' || action === 'delete') return true
  }

  // 7. Token: a user can manage their own tokens
  if (resourceType === 'token' && info?.ownerUserId === userId) {
    return true
  }

  return false
}

/**
 * Throwing variant — for Server Actions / Route Handlers that want to
 * early-return on deny. Includes a default audit-friendly reason.
 */
export async function requirePermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: Permission,
  opts: CheckPermissionOpts = {},
): Promise<void> {
  const allowed = await checkPermission(userId, resourceType, resourceId, action, opts)
  if (!allowed) {
    throw new PermissionError(
      opts.reason ?? `无权对资源 ${resourceType}/${resourceId} 执行 ${action}`,
      {
        data: { resourceType, resourceId, action },
      },
    )
  }
}

// ---------------- Role helpers ----------------
export async function requireRole(userId: string, ...roles: Role[]): Promise<void> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  if (!u || u.status !== 'active') {
    throw new PermissionError('账号不存在或已禁用')
  }
  if (!roles.includes((u.role as Role) ?? 'user')) {
    throw new PermissionError('需要更高权限', { data: { required: roles, actual: u.role } })
  }
}

export async function requireAdmin(userId: string): Promise<void> {
  await requireRole(userId, 'admin', 'superadmin')
}

export async function requireSuperadmin(userId: string): Promise<void> {
  await requireRole(userId, 'superadmin')
}

/** Is `userId` an admin (or above) of group `groupId`? */
export async function isGroupAdminOf(userId: string, groupId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  if (!u || u.status !== 'active') return false
  if (u.role === 'superadmin') return true
  if (u.role === 'admin') return true
  return isGroupAdmin(userId, groupId)
}
