export const eventParticipantStatuses = ["going", "maybe", "no", "invited"] as const;

export type EventParticipantStatus = (typeof eventParticipantStatuses)[number];

export type EventWindow = {
  date: string;
  startHour: number;
  endHour: number;
};

export function overlapsEventWindow(left: EventWindow, right: EventWindow) {
  return left.date === right.date && left.startHour < right.endHour && right.startHour < left.endHour;
}

