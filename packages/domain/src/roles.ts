export const roles = ["master", "head_admin", "admin", "manager", "teamlead", "member", "viewer"] as const;

export type Role = (typeof roles)[number];

export const systemRoles: Record<Role, { label: string; locked: boolean }> = {
  master: { label: "Master", locked: true },
  head_admin: { label: "Head admin", locked: true },
  admin: { label: "Admin", locked: true },
  manager: { label: "Manager", locked: true },
  teamlead: { label: "Team lead", locked: true },
  member: { label: "Member", locked: true },
  viewer: { label: "Viewer", locked: true }
};

export type Actor = {
  role: Role;
  profileId: string | null;
  teamIds?: string[];
  permissions?: Permission[];
};

export function isAdminRole(role: Role) {
  return role === "master" || role === "head_admin" || role === "admin";
}

export const permissions = [
  "dashboard:view",
  "schedule:view:self",
  "schedule:view:team",
  "schedule:view:all",
  "schedule:edit:self",
  "schedule:edit:team",
  "schedule:edit:all",
  "event:view:all",
  "event:respond:all",
  "event:create",
  "event:edit:own",
  "event:delete:own",
  "event:manage:team",
  "event:edit:all",
  "event:delete:all",
  "team:view",
  "team:manage",
  "user:manage",
  "role:manage",
  "system:manage"
] as const;

export type Permission = (typeof permissions)[number];

export const defaultRolePermissions: Record<Role, Permission[]> = {
  master: [...permissions],
  head_admin: permissions.filter((permission) => permission !== "system:manage" && permission !== "role:manage"),
  admin: [
    "dashboard:view",
    "schedule:view:all",
    "schedule:edit:all",
    "event:view:all",
    "event:respond:all",
    "event:create",
    "event:edit:all",
    "event:delete:all",
    "team:view",
    "team:manage",
    "user:manage"
  ],
  manager: [
    "dashboard:view",
    "schedule:view:all",
    "event:view:all",
    "event:respond:all",
    "event:create",
    "event:edit:all",
    "event:delete:all",
    "team:view"
  ],
  teamlead: [
    "dashboard:view",
    "schedule:view:team",
    "schedule:edit:self",
    "event:view:all",
    "event:respond:all",
    "event:create",
    "event:edit:own",
    "event:delete:own",
    "event:manage:team",
    "team:view"
  ],
  member: [
    "schedule:view:self",
    "schedule:edit:self",
    "event:view:all",
    "event:respond:all",
    "event:create",
    "event:edit:own",
    "event:delete:own"
  ],
  viewer: ["schedule:view:self", "event:view:all", "event:respond:all"]
};

export function hasPermission(actor: Actor | null, permission: Permission) {
  if (!actor) return false;
  if (actor.role === "master") return true;
  return (actor.permissions ?? defaultRolePermissions[actor.role] ?? []).includes(permission);
}

export function canManageRoles(actor: Actor | null) {
  return hasPermission(actor, "role:manage") && actor?.role === "master";
}

