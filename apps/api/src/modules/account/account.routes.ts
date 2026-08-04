import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { bumpWorkspaceRevision } from "../workspaces/workspace.service.js";

const accountUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  interests: z.array(z.string().trim().min(1).max(40)).max(20),
  theme: z.string().trim().min(2).max(32).default("dark"),
  density: z.string().trim().min(2).max(32).default("normal"),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  showEvents: z.boolean().default(true)
});

export async function registerAccountRoutes(server: FastifyInstance) {
  server.get("/api/account", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      include: { profile: true, preferences: true }
    });

    return {
      data: {
        login: user?.login ?? actor.login,
        email: user?.email ?? null,
        profile: user?.profile
          ? {
              id: user.profile.id,
              displayName: user.profile.displayName,
              color: user.profile.color,
              avatarUrl: user.profile.avatarUrl,
              interests: user.profile.interests
            }
          : null,
        preferences: user?.preferences ?? null
      }
    };
  });

  server.put("/api/account", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!actor.profileId) return reply.code(409).send({ error: "missing_profile", message: "Account has no participant profile" });

    const input = accountUpdateSchema.parse(request.body);
    await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.participantProfile.update({
        where: { id: actor.profileId! },
        data: {
          displayName: input.displayName,
          color: input.color,
          interests: input.interests
        }
      });
      await tx.userPreference.upsert({
        where: { userId: actor.id },
        create: {
          userId: actor.id,
          theme: input.theme,
          density: input.density,
          timezone: input.timezone,
          showEvents: input.showEvents
        },
        update: {
          theme: input.theme,
          density: input.density,
          timezone: input.timezone,
          showEvents: input.showEvents
        }
      });
    });
    if (actor.workspaceId) await bumpWorkspaceRevision(actor.workspaceId, "account", actor.id);

    return { data: { ok: true } };
  });
}
