import { canEditParticipant, canManageEvents, type Role } from "@collabhub/domain";

export function canEditProfile(role: Role, actorProfileId: string | null, targetProfileId: string) {
  return canEditParticipant({ role, profileId: actorProfileId }, targetProfileId);
}

export function canManageEvent(role: Role) {
  return canManageEvents(role);
}

