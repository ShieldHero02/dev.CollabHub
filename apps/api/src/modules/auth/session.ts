import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission, Role } from "@collabhub/domain";
import { prisma } from "../../plugins/prisma.js";

export type AuthUser = {
  id: string;
  login: string;
  email: string | null;
  role: Role;
  profileId: string | null;
  permissions: Permission[];
};

type LoadedRoleAssignment = {
  role: {
    permissions: Array<{
      permission: { key: string };
    }>;
  };
};

const sessionCookieName = "collabhub_session";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return;
    cookies.set(rawKey, decodeURIComponent(rawValue.join("=")));
  });
  return cookies;
}

export function readSessionToken(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return parseCookies(request.headers.cookie).get(sessionCookieName) ?? null;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${expiresAt.toUTCString()}`
  );
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });
  return { token, expiresAt };
}

export async function resolveAuthUser(request: FastifyRequest): Promise<AuthUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return resolveAuthUserFromToken(token);
}

export async function resolveAuthUserFromToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          profile: true,
          roleAssignments: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "active") return null;
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });
  const permissions = new Set<Permission>();
  (session.user.roleAssignments as LoadedRoleAssignment[]).forEach((assignment) => {
    assignment.role.permissions.forEach((link) => permissions.add(link.permission.key as Permission));
  });
  return {
    id: session.user.id,
    login: session.user.login,
    email: session.user.email,
    role: session.user.roleKey as Role,
    profileId: session.user.profile?.id ?? null,
    permissions: [...permissions]
  };
}

export function publicUser(user: AuthUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    role: user.role,
    profileId: user.profileId,
    permissions: user.permissions
  };
}
