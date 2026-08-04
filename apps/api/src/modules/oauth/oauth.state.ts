import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { OAuthProviderName } from "./oauth.providers.js";

export type OAuthMode = "login" | "link";

type OAuthState = {
  provider: OAuthProviderName;
  mode: OAuthMode;
  nonce: string;
  issuedAt: number;
  actorUserId?: string;
};

const stateLifetimeSeconds = 10 * 60;
const stateCookieName = "collabhub_oauth_state";

export function createOAuthState(provider: OAuthProviderName, mode: OAuthMode, actorUserId?: string) {
  const payload: OAuthState = {
    provider,
    mode,
    nonce: randomBytes(32).toString("base64url"),
    issuedAt: Math.floor(Date.now() / 1000),
    ...(actorUserId ? { actorUserId } : {})
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { value: `${encoded}.${sign(encoded)}`, nonce: payload.nonce };
}

export function setOAuthStateCookie(reply: FastifyReply, nonce: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  appendSetCookie(
    reply,
    `${stateCookieName}=${encodeURIComponent(nonce)}; Path=/api/oauth; HttpOnly; SameSite=Lax${secure}; Max-Age=${stateLifetimeSeconds}`
  );
}

export function clearOAuthStateCookie(reply: FastifyReply) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  appendSetCookie(reply, `${stateCookieName}=; Path=/api/oauth; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
}

export function verifyOAuthState(request: FastifyRequest, value: string, provider: OAuthProviderName): OAuthState | null {
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length > 0 || !safeEqual(signature, sign(encoded))) return null;

  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
  const cookieNonce = readCookie(request.headers.cookie, stateCookieName);
  const age = Math.floor(Date.now() / 1000) - state.issuedAt;
  if (state.provider !== provider || !cookieNonce || !safeEqual(cookieNonce, state.nonce) || age < 0 || age > stateLifetimeSeconds) {
    return null;
  }
  if (state.mode !== "login" && state.mode !== "link") return null;
  return state;
}

function sign(value: string) {
  const secret = process.env.OAUTH_STATE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("OAUTH_STATE_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function appendSetCookie(reply: FastifyReply, cookie: string) {
  const existing = reply.getHeader("Set-Cookie");
  if (Array.isArray(existing)) return reply.header("Set-Cookie", [...existing, cookie]);
  if (typeof existing === "string") return reply.header("Set-Cookie", [existing, cookie]);
  return reply.header("Set-Cookie", cookie);
}
