import { type Actor, hasPermission } from "./roles.js";

export function canViewParticipant(actor: Actor | null, targetProfileId: string, targetTeamIds: string[] = []) {
  if (!actor || !targetProfileId) return false;
  if (actor.profileId === targetProfileId) return hasPermission(actor, "schedule:view:self");
  if (hasPermission(actor, "schedule:view:all")) return true;
  return hasPermission(actor, "schedule:view:team") && sharesTeam(actor.teamIds, targetTeamIds);
}

export function canEditParticipant(actor: Actor | null, targetProfileId: string, targetTeamIds: string[] = []) {
  if (!actor) return false;
  if (hasPermission(actor, "schedule:edit:all")) return true;
  if (actor.profileId === targetProfileId) return hasPermission(actor, "schedule:edit:self");
  return hasPermission(actor, "schedule:edit:team") && sharesTeam(actor.teamIds, targetTeamIds);
}

export function canViewEvents(actor: Actor | null) {
  return hasPermission(actor, "event:view:all");
}

export function canRespondToEvent(actor: Actor | null) {
  return hasPermission(actor, "event:respond:all");
}

export function canCreateEvent(actor: Actor | null) {
  return hasPermission(actor, "event:create");
}

export function canEditEvent(actor: Actor | null, eventOwnerUserId: string, actorUserId: string | null, eventTeamId?: string | null) {
  if (!actor) return false;
  if (hasPermission(actor, "event:edit:all")) return true;
  if (actorUserId && actorUserId === eventOwnerUserId) return hasPermission(actor, "event:edit:own");
  return hasPermission(actor, "event:manage:team") && Boolean(eventTeamId && actor.teamIds?.includes(eventTeamId));
}

export function canDeleteEvent(actor: Actor | null, eventOwnerUserId: string, actorUserId: string | null, eventTeamId?: string | null) {
  if (!actor) return false;
  if (hasPermission(actor, "event:delete:all")) return true;
  if (actorUserId && actorUserId === eventOwnerUserId) return hasPermission(actor, "event:delete:own");
  return hasPermission(actor, "event:manage:team") && Boolean(eventTeamId && actor.teamIds?.includes(eventTeamId));
}

export function canEditOwnEventStatus(actor: Actor | null) {
  return canRespondToEvent(actor);
}

export function canManageEvents(actor: Actor | null) {
  return hasPermission(actor, "event:edit:all") || hasPermission(actor, "event:manage:team");
}

function sharesTeam(actorTeamIds: string[] | undefined, targetTeamIds: string[]) {
  return Boolean(actorTeamIds?.some((teamId) => targetTeamIds.includes(teamId)));
}

