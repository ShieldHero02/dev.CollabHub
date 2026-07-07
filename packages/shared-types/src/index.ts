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

