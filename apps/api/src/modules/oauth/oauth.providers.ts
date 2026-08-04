export const oauthProviderNames = ["twitch", "youtube"] as const;

export type OAuthProviderName = (typeof oauthProviderNames)[number];

export type OAuthIdentity = {
  providerAccountId: string;
  displayName: string | null;
};

type OAuthProvider = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizationUrl: string;
  buildAuthorizationParams: () => Record<string, string>;
  exchangeCode: (code: string) => Promise<string>;
  loadIdentity: (accessToken: string) => Promise<OAuthIdentity>;
};

export function oauthProviderEnabled(provider: OAuthProviderName) {
  return process.env[provider === "twitch" ? "TWITCH_OAUTH_ENABLED" : "GOOGLE_OAUTH_ENABLED"] === "true";
}

export function getOAuthProvider(provider: OAuthProviderName): OAuthProvider {
  return provider === "twitch" ? twitchProvider() : youtubeProvider();
}

function twitchProvider(): OAuthProvider {
  const clientId = requiredEnv("TWITCH_CLIENT_ID");
  const clientSecret = requiredEnv("TWITCH_CLIENT_SECRET");
  const callbackUrl = requiredEnv("TWITCH_OAUTH_CALLBACK_URL");

  return {
    clientId,
    clientSecret,
    callbackUrl,
    authorizationUrl: "https://id.twitch.tv/oauth2/authorize",
    buildAuthorizationParams: () => ({ scope: "" }),
    exchangeCode: async (code) => {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl
      });
      const token = await fetchJson<{ access_token?: string }>("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      });
      if (!token.access_token) throw new OAuthProviderError("Twitch did not return an access token");
      return token.access_token;
    },
    loadIdentity: async (accessToken) => {
      const result = await fetchJson<{ data?: Array<{ id: string; display_name?: string }> }>("https://api.twitch.tv/helix/users", {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "client-id": clientId
        }
      });
      const user = result.data?.[0];
      if (!user?.id) throw new OAuthProviderError("Twitch account identity is unavailable");
      return { providerAccountId: user.id, displayName: user.display_name ?? null };
    }
  };
}

function youtubeProvider(): OAuthProvider {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const callbackUrl = requiredEnv("GOOGLE_OAUTH_CALLBACK_URL");

  return {
    clientId,
    clientSecret,
    callbackUrl,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    buildAuthorizationParams: () => ({
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      include_granted_scopes: "true"
    }),
    exchangeCode: async (code) => {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl
      });
      const token = await fetchJson<{ access_token?: string }>("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      });
      if (!token.access_token) throw new OAuthProviderError("Google did not return an access token");
      return token.access_token;
    },
    loadIdentity: async (accessToken) => {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.search = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "1" }).toString();
      const result = await fetchJson<{ items?: Array<{ id: string; snippet?: { title?: string } }> }>(url, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const channel = result.items?.[0];
      if (!channel?.id) throw new OAuthProviderError("No YouTube channel is available for this Google account");
      return { providerAccountId: channel.id, displayName: channel.snippet?.title ?? null };
    }
  };
}

async function fetchJson<T>(input: string | URL, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new OAuthProviderError("OAuth provider request failed");
  }
  if (!response.ok) {
    throw new OAuthProviderError(`OAuth provider rejected the request (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new OAuthConfigurationError(`Missing required environment variable: ${name}`);
  return value;
}

export class OAuthConfigurationError extends Error {}
export class OAuthProviderError extends Error {}
