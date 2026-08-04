import type {
  ApiEnvelope,
  AuthResponseDto,
  AvailabilityWeekDto,
  CreateEventDto,
  EventDto,
  EventParticipantStatusDto,
  SaveAvailabilityWeekDto,
  CurrentUserDto,
  ParticipantDto,
  SyncSnapshotDto
} from "@collabhub/shared-types";

export type SetupStatusDto = {
  needsBootstrap: boolean;
};

export type MeResponseDto = {
  authenticated: boolean;
  user: CurrentUserDto | null;
};

export type AccountDto = {
  login: string;
  email: string | null;
  profile: ParticipantDto | null;
  preferences: {
    theme: string;
    density: string;
    timezone: string;
    showEvents: boolean;
  } | null;
};

const defaultApiBase = "/api";

export const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? defaultApiBase;

export class ApiClient {
  constructor(private token: string | null) {}

  async setupStatus() {
    return this.request<SetupStatusDto>("/auth/setup-status");
  }

  async bootstrap(payload: { login: string; password: string; displayName: string }) {
    return this.request<AuthResponseDto>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async login(payload: { login: string; password: string }) {
    return this.request<AuthResponseDto>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async logout() {
    await this.request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  }

  async me() {
    return this.request<MeResponseDto>("/me");
  }

  async account() {
    const response = await this.request<ApiEnvelope<AccountDto>>("/account");
    return response.data;
  }

  async saveAccount(payload: {
    displayName: string;
    color: string;
    interests: string[];
    theme: string;
    density: string;
    timezone: string;
    showEvents: boolean;
  }) {
    const response = await this.request<ApiEnvelope<{ ok: boolean }>>("/account", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return response.data;
  }

  async participants() {
    const response = await this.request<ApiEnvelope<ParticipantDto[]>>("/participants");
    return response.data;
  }

  async availabilityWeek(startDate: string, profileId?: string) {
    const params = new URLSearchParams({ start: startDate });
    if (profileId) params.set("profileId", profileId);
    const response = await this.request<ApiEnvelope<AvailabilityWeekDto>>(`/availability/week?${params}`);
    return response.data;
  }

  async saveAvailabilityWeek(profileId: string, payload: SaveAvailabilityWeekDto) {
    const response = await this.request<ApiEnvelope<{ saved: number }>>(`/availability/profiles/${profileId}/week`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return response.data;
  }

  async events(start?: string, end?: string) {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const suffix = params.toString() ? `?${params}` : "";
    const response = await this.request<ApiEnvelope<EventDto[]>>(`/events${suffix}`);
    return response.data;
  }

  async createEvent(payload: CreateEventDto) {
    const response = await this.request<ApiEnvelope<EventDto>>("/events", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return response.data;
  }

  async respondToEvent(eventId: string, status: EventParticipantStatusDto) {
    const response = await this.request<ApiEnvelope<{ ok: boolean }>>(`/events/${eventId}/response`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    return response.data;
  }

  async syncSnapshot() {
    const response = await this.request<ApiEnvelope<SyncSnapshotDto>>("/sync/snapshot");
    return response.data;
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : "API request failed";
      throw new Error(message);
    }

    return payload as T;
  }
}
