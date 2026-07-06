export const availabilityStatuses = [
  "free",
  "busy",
  "maybe",
  "stream",
  "work",
  "study",
  "unknown"
] as const;

export type AvailabilityStatus = (typeof availabilityStatuses)[number];

export type AvailabilitySlot = {
  profileId: string;
  date: string;
  hour: number;
  status: AvailabilityStatus;
};

export function isValidHour(hour: number) {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

export function aggregateAvailability(slots: AvailabilitySlot[], totalParticipants: number) {
  const freeCount = slots.filter((slot) => slot.status === "free" || slot.status === "stream").length;
  const maybeCount = slots.filter((slot) => slot.status === "maybe").length;
  const busyCount = slots.filter((slot) => ["busy", "work", "study"].includes(slot.status)).length;

  if (totalParticipants <= 0) return "unknown";
  if (freeCount >= Math.ceil(totalParticipants / 2)) return "many-free";
  if (freeCount > 0) return "some-free";
  if (maybeCount > 0) return "maybe";
  if (busyCount > 0) return "busy";
  return "unknown";
}

