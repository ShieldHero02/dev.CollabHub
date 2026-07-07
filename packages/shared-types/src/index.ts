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
  permissions: string[];
};

export type AuthResponseDto = {
  token: string;
  user: CurrentUserDto | null;
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

export type LegacyImportPreviewDto = {
  participants: number;
  accounts: number;
  teams: number;
  templateSlots: number;
  datedSlots: number;
  comments: number;
  presets: number;
  events: number;
  eventParticipants: number;
  warnings: string[];
};

export type LegacyImportResultDto = {
  jobId: string;
  summary: LegacyImportPreviewDto;
};

