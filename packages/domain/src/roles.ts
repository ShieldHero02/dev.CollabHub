export const roles = ["master", "admin", "teamlead", "member", "viewer"] as const;

export type Role = (typeof roles)[number];

export type Actor = {
  role: Role;
  profileId: string | null;
  teamIds?: string[];
};

export function isAdminRole(role: Role) {
  return role === "master" || role === "admin";
}

