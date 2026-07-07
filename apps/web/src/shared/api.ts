import type {
  ApiEnvelope,
  AuthResponseDto,
  AvailabilityWeekDto,
  SaveAvailabilityWeekDto,
  CurrentUserDto,
  ParticipantDto
} from "@collabhub/shared-types";

export type SetupStatusDto = {
  needsBootstrap: boolean;
};

export type MeResponseDto = {
  authenticated: boolean;
  user: CurrentUserDto | null;
};

const defaultApiBase = "http://localhost:4000";

export const apiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? defaultApiBase;

export class ApiClient {
  constructor(private token: string | null) {}

  async setupStatus() {
    return this.request<SetupStatusDto>("/api/auth/setup-status");
  }

  async bootstrap(payload: { login: string; password: string; displayName: string }) {
    return this.request<AuthResponseDto>("/api/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async login(payload: { login: string; password: string }) {
    return this.request<AuthResponseDto>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async logout() {
    await this.request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  }

  async me() {
    return this.request<MeResponseDto>("/api/me");
  }

  async participants() {
    const response = await this.request<ApiEnvelope<ParticipantDto[]>>("/api/participants");
    return response.data;
  }

  async availabilityWeek(startDate: string, profileId?: string) {
    const params = new URLSearchParams({ start: startDate });
    if (profileId) params.set("profileId", profileId);
    const response = await this.request<ApiEnvelope<AvailabilityWeekDto>>(`/api/availability/week?${params}`);
    return response.data;
  }

  async saveAvailabilityWeek(profileId: string, payload: SaveAvailabilityWeekDto) {
    const response = await this.request<ApiEnvelope<{ saved: number }>>(`/api/availability/profiles/${profileId}/week`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
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
