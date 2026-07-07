import { hasPermission, type Permission } from "@collabhub/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "./errors.js";
import { resolveAuthUser, type AuthUser } from "../modules/auth/session.js";

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
  const user = await resolveAuthUser(request);
  if (!user) {
    await unauthorized(reply);
    return null;
  }
  return user;
}

export async function requirePermission(request: FastifyRequest, reply: FastifyReply, permission: Permission): Promise<AuthUser | null> {
  const user = await requireUser(request, reply);
  if (!user) return null;
  if (!hasPermission(user, permission)) {
    await forbidden(reply);
    return null;
  }
  return user;
}
