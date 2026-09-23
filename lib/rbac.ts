import type { Role, SessionUser } from "./types";

/**
 * Aperio RBAC — permission matrix.
 *
 *  - admin         : full access (moderation, back-office, payout validation)
 *  - photographer  : publishes/manages its own works, creator dashboard, payouts
 *  - buyer         : catalog, cart, checkout, own orders & certificates
 *
 * Endpoints still enforce entity-level ownership checks (canManageResource)
 * on top of these coarse-grained permissions — never trust the client.
 */
export const ROLES: readonly Role[] = ["admin", "photographer", "buyer"] as const;
export const CREATOR_ROLES: readonly Role[] = ["admin", "photographer"] as const;

export type Permission =
  | "photos:create"
  | "photos:manage"
  | "photos:download-hd"
  | "dashboard:view"
  | "payouts:create"
  | "payouts:manage"
  | "orders:view"
  | "orders:manage"
  | "certificates:manage"
  | "profile:edit"
  | "collections:manage"
  | "admin:access";

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    "photos:create",
    "photos:manage",
    "photos:download-hd",
    "dashboard:view",
    "payouts:create",
    "payouts:manage",
    "orders:view",
    "orders:manage",
    "certificates:manage",
    "profile:edit",
    "collections:manage",
    "admin:access",
  ]),
  photographer: new Set([
    "photos:create",
    "photos:manage",
    "photos:download-hd",
    "dashboard:view",
    "payouts:create",
    "orders:view",
    "profile:edit",
    "collections:manage",
  ]),
  buyer: new Set([
    "orders:view",
    "profile:edit",
    "collections:manage",
  ]),
};

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin";
}

export function hasAnyRole(user: SessionUser | null, roles: readonly Role[]): boolean {
  return !!user && roles.includes(user.role);
}

/** Grants the permission if the user has it for ANY of the requested roles. */
export function can(user: SessionUser | null, permission: Permission): boolean {
  return !!user && ROLE_PERMISSIONS[user.role].has(permission);
}

/** True when the user owns the resource (by ownerId) or is an admin. */
export function canManageResource(
  user: SessionUser | null,
  ownerId: number,
): boolean {
  return !!user && (user.id === ownerId || user.role === "admin");
}

/** True when the user owns the resource (by ownerId) and is not an admin. */
export function isOwner(user: SessionUser | null, ownerId: number): boolean {
  return !!user && user.id === ownerId;
}