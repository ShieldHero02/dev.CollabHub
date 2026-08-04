import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../plugins/prisma.js";
import { createSession, publicUser, resolveAuthUserFromToken, setSessionCookie, clearSessionCookie, hashSessionToken, readSessionToken } from "./session.js";
import { assignRoleByKey, ensureSystemAccess } from "./rbac.seed.js";
import { unauthorized } from "../../http/errors.js";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "./passwords.js";
import { ensureDefaultWorkspace, linkUserToWorkspace } from "../workspaces/workspace.service.js";

const credentialsSchema = z.object({
  login: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(200)
});

const bootstrapSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().optional()
});

export async function registerAuthRoutes(server: FastifyInstance) {
  server.get("/api/auth/setup-status", async () => {
    const usersCount = await prisma.user.count();
    return { needsBootstrap: usersCount === 0 };
  });

  server.post("/api/auth/bootstrap", async (request, reply) => {
    await ensureSystemAccess();
    const usersCount = await prisma.user.count();
    if (usersCount > 0) return reply.code(409).send({ error: "already_bootstrapped", message: "Master account already exists" });

    const input = bootstrapSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const workspace = await ensureDefaultWorkspace();
    const user = await prisma.user.create({
      data: {
        login: input.login,
        email: input.email ?? null,
        passwordHash,
        roleKey: "master",
        profile: {
          create: {
            workspaceId: workspace.id,
            displayName: input.displayName ?? input.login,
            color: "#7b6cff"
          }
        },
        preferences: {
          create: {}
        }
      },
      include: { profile: true }
    });
    await assignRoleByKey(user.id, "master");
    await linkUserToWorkspace(user.id, "master", workspace.id);
    const session = await createSession(user.id);
    setSessionCookie(reply, session.token, session.expiresAt);

    return reply.code(201).send({
      token: session.token,
      user: publicUser(await resolveAuthUserFromToken(session.token))
    });
  });

  server.post("/api/auth/login", async (request, reply) => {
    await ensureSystemAccess();
    const input = credentialsSchema.parse(request.body);
    const user = await prisma.user.findFirst({
      where: {
        login: {
          equals: input.login,
          mode: "insensitive"
        }
      }
    });
    if (!user || user.status !== "active" || !(await verifyPassword(user.passwordHash, input.password))) {
      return unauthorized(reply, "Invalid login or password");
    }
    if (isLegacyPasswordHash(user.passwordHash)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) }
      });
    }

    const session = await createSession(user.id);
    setSessionCookie(reply, session.token, session.expiresAt);
    return {
      token: session.token,
      user: publicUser(await resolveAuthUserFromToken(session.token))
    };
  });

  server.post("/api/auth/logout", async (request, reply) => {
    const token = readSessionToken(request);
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    clearSessionCookie(reply);
    return { ok: true };
  });
}
