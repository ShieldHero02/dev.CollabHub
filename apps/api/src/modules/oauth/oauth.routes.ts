import type { FastifyInstance } from "fastify";
import type { OAuthProviderDto } from "@collabhub/shared-types";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { createSession, resolveAuthUser, setSessionCookie } from "../auth/session.js";
import { getOAuthProvider, oauthProviderEnabled, oauthProviderNames, OAuthConfigurationError, OAuthProviderError } from "./oauth.providers.js";
import { clearOAuthStateCookie, createOAuthState, setOAuthStateCookie, verifyOAuthState } from "./oauth.state.js";

const providerSchema = z.object({ provider: z.enum(oauthProviderNames) });
const startQuerySchema = z.object({ mode: z.enum(["login", "link"]).default("login") });
const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().max(200).optional()
});

export async function registerOAuthRoutes(server: FastifyInstance) {
  server.get("/api/oauth/providers", async () => ({
    data: oauthProviderNames.map((provider): { provider: OAuthProviderDto; enabled: boolean } => ({
      provider,
      enabled: oauthProviderEnabled(provider)
    }))
  }));

  server.get("/api/oauth/:provider/start", async (request, reply) => {
    const { provider: providerName } = providerSchema.parse(request.params);
    const { mode } = startQuerySchema.parse(request.query);
    if (!oauthProviderEnabled(providerName)) {
      return reply.code(503).send({ error: "oauth_provider_disabled", message: `${providerName} OAuth is not enabled` });
    }

    const actor = await resolveAuthUser(request);
    if (mode === "link" && !actor) {
      return reply.code(401).send({ error: "unauthorized", message: "Sign in before linking an external account" });
    }
    let provider;
    let state;
    try {
      provider = getOAuthProvider(providerName);
      state = createOAuthState(providerName, mode, actor?.id);
    } catch (error) {
      if (error instanceof OAuthConfigurationError || (error instanceof Error && error.message.startsWith("OAUTH_STATE_SECRET"))) {
        request.log.error({ provider: providerName }, error.message);
        return reply.code(503).send({ error: "oauth_not_configured", message: "OAuth provider is not configured" });
      }
      throw error;
    }
    const url = new URL(provider.authorizationUrl);
    url.search = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.callbackUrl,
      response_type: "code",
      state: state.value,
      ...provider.buildAuthorizationParams()
    }).toString();
    setOAuthStateCookie(reply, state.nonce);
    return reply.redirect(url.toString());
  });

  server.get("/api/oauth/:provider/callback", { logLevel: "silent" }, async (request, reply) => {
    const { provider: providerName } = providerSchema.parse(request.params);
    const query = callbackQuerySchema.parse(request.query);
    clearOAuthStateCookie(reply);
    if (!oauthProviderEnabled(providerName)) {
      return reply.code(503).send({ error: "oauth_provider_disabled", message: `${providerName} OAuth is not enabled` });
    }

    let state;
    try {
      state = verifyOAuthState(request, query.state, providerName);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("OAUTH_STATE_SECRET")) {
        request.log.error({ provider: providerName }, error.message);
        return reply.code(503).send({ error: "oauth_not_configured", message: "OAuth provider is not configured" });
      }
      throw error;
    }
    if (!state) return reply.code(400).send({ error: "invalid_oauth_state", message: "OAuth state is invalid or expired" });
    if (query.error) return reply.code(400).send({ error: "oauth_denied", message: "OAuth authorization was not completed" });
    if (!query.code) return reply.code(400).send({ error: "missing_oauth_code", message: "OAuth provider did not return a code" });

    try {
      const provider = getOAuthProvider(providerName);
      const accessToken = await provider.exchangeCode(query.code);
      const identity = await provider.loadIdentity(accessToken);

      if (state.mode === "link") {
        const actor = await resolveAuthUser(request);
        if (!actor || !state.actorUserId || actor.id !== state.actorUserId) {
          return reply.code(401).send({ error: "oauth_session_changed", message: "The linking session is no longer valid" });
        }
        const existing = await prisma.connectedAccount.findUnique({
          where: { provider_providerAccountId: { provider: providerName, providerAccountId: identity.providerAccountId } }
        });
        if (existing && existing.userId !== actor.id) {
          return reply.code(409).send({ error: "oauth_account_in_use", message: "This external account is linked to another user" });
        }
        if (existing) {
          await prisma.connectedAccount.update({ where: { id: existing.id }, data: { displayName: identity.displayName } });
        } else {
          await prisma.connectedAccount.create({
            data: { userId: actor.id, provider: providerName, providerAccountId: identity.providerAccountId, displayName: identity.displayName }
          });
        }
        return redirectOrJson(reply, "linked", providerName);
      }

      const account = await prisma.connectedAccount.findUnique({
        where: { provider_providerAccountId: { provider: providerName, providerAccountId: identity.providerAccountId } },
        include: { user: true }
      });
      if (!account) {
        return reply.code(409).send({
          error: "oauth_account_not_linked",
          message: "No CollabHub account is linked. Sign in with a password and link this account first."
        });
      }
      if (account.user.status !== "active") {
        return reply.code(403).send({ error: "account_inactive", message: "This CollabHub account is not active" });
      }
      const session = await createSession(account.userId);
      setSessionCookie(reply, session.token, session.expiresAt);
      clearOAuthStateCookie(reply);
      return redirectOrJson(reply, "authenticated", providerName);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        request.log.error({ provider: providerName }, error.message);
        return reply.code(503).send({ error: "oauth_not_configured", message: "OAuth provider is not configured" });
      }
      if (error instanceof OAuthProviderError) {
        request.log.warn({ provider: providerName }, error.message);
        return reply.code(502).send({ error: "oauth_provider_error", message: error.message });
      }
      throw error;
    }
  });
}

function redirectOrJson(reply: Parameters<typeof setSessionCookie>[0], result: "linked" | "authenticated", provider: string) {
  const redirectUrl = process.env.OAUTH_SUCCESS_REDIRECT_URL?.trim();
  if (!redirectUrl) return reply.send({ data: { result, provider } });
  const url = new URL(redirectUrl);
  url.searchParams.set("oauth", result);
  url.searchParams.set("provider", provider);
  return reply.redirect(url.toString());
}
