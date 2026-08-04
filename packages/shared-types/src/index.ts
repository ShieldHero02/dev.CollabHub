export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  error: string;
  message: string;
};

export type CurrentUserDto = {
  id: string;
  login: string;
  email: string | null;
  role: string;
  profileId: string | null;
  workspaceId: string | null;
  permissions: string[];
};

export type AuthResponseDto = {
  token: string;
  user: CurrentUserDto | null;
};

export type OAuthProviderDto = "twitch" | "youtube";

export type OAuthResultDto = {
  result: "linked" | "authenticated";
  provider: OAuthProviderDto;
};

export type ParticipantDto = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  interests: string[];
};

export type AvailabilityStatusDto =
  | "free"
  | "busy"
  | "maybe"
  | "stream"
  | "work"
  | "study"
  | "unknown";

export type AvailabilityCellDto = {
  profileId: string;
  date: string;
  hour: number;
  status: AvailabilityStatusDto;
  comment: string;
};

export type AvailabilityWeekDto = {
  startDate: string;
  endDate: string;
  cells: AvailabilityCellDto[];
};

export type SaveAvailabilityWeekDto = {
  cells: Array<{
    date: string;
    hour: number;
    status: AvailabilityStatusDto;
    comment?: string;
  }>;
};

export type EventParticipantStatusDto = "going" | "maybe" | "no" | "invited";

export type EventDto = {
  id: string;
  title: string;
  activity: string | null;
  description: string | null;
  date: string;
  startHour: number;
  endHour: number;
  createdByUserId: string;
  canEdit: boolean;
  participants: Array<{
    profileId: string;
    displayName: string;
    color: string;
    status: EventParticipantStatusDto;
  }>;
};

export type CreateEventDto = {
  title: string;
  activity?: string;
  description?: string;
  date: string;
  startHour: number;
  endHour: number;
  participantIds?: string[];
};

export type SyncSnapshotDto = {
  revision: number;
  participants: ParticipantDto[];
  events: EventDto[];
};

export type SyncRevisionDto = {
  revision: number;
};

export type UpdateUserDto = {
  role?: string;
  status?: "active" | "disabled";
  displayName?: string;
};

export type ResetUserPasswordDto = {
  temporaryPassword: string;
};

export type UserDto = {
  id: string;
  login: string;
  email: string | null;
  role: string;
  status: string;
  profile: ParticipantDto | null;
  roles: string[];
};

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

