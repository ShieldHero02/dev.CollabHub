import { type Actor, isAdminRole, type Role } from "./roles.js";

export function canViewParticipant(actor: Actor | null, targetProfileId: string) {
  return Boolean(actor && targetProfileId);
}

export function canEditParticipant(actor: Actor | null, targetProfileId: string) {
  if (!actor) return false;
  if (isAdminRole(actor.role)) return true;
  return actor.profileId === targetProfileId;
}

export function canManageEvents(role: Role) {
  return role === "master" || role === "admin" || role === "teamlead";
}

export function canEditOwnEventStatus(actor: Actor | null, targetProfileId: string) {
  if (!actor) return false;
  return canManageEvents(actor.role) || actor.profileId === targetProfileId;
}

export function canImportLegacyData(actor: Actor | null) {
  return actor?.role === "master";
}

