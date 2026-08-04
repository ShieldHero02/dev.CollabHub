import type { FastifyInstance } from "fastify";
import { requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { currentWorkspaceRevision } from "../workspaces/workspace.service.js";
import { canEditEvent } from "@collabhub/domain";

export async function registerSyncRoutes(server: FastifyInstance) {
  server.get("/api/sync/snapshot", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!actor.workspaceId) {
      return { data: { revision: 0, participants: [], events: [] } };
    }
    const workspaceId = actor.workspaceId;

    const [revision, participants, events] = await prisma.$transaction(async (tx) => Promise.all([
      tx.syncRevision.findFirst({
        where: { workspaceId },
        orderBy: { version: "desc" },
        select: { version: true }
      }).then((row) => row?.version ?? 0),
      tx.participantProfile.findMany({
        where: { workspaceId },
        orderBy: { displayName: "asc" }
      }),
      tx.event.findMany({
        where: { workspaceId },
        orderBy: [{ date: "asc" }, { startHour: "asc" }],
        include: { participants: { include: { profile: true } } },
        take: 100
      })
    ]), { isolationLevel: "RepeatableRead" });

    return {
      data: {
        revision,
        participants: participants.map((profile: any) => ({
          id: profile.id,
          displayName: profile.displayName,
          color: profile.color,
          avatarUrl: profile.avatarUrl,
          interests: profile.interests
        })),
        events: events.map((event: any) => ({
          id: event.id,
          title: event.title,
          activity: event.activity,
          description: event.description,
          date: event.date.toISOString().slice(0, 10),
          startHour: event.startHour,
          endHour: event.endHour,
          createdByUserId: event.createdByUserId,
          canEdit: canEditEvent(actor, event.createdByUserId, actor.id, event.teamId),
          participants: event.participants.map((link: any) => ({
            profileId: link.profileId,
            displayName: link.profile.displayName,
            color: link.profile.color,
            status: link.status
          }))
        }))
      }
    };
  });

  server.get("/api/sync/revision", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    const revision = actor.workspaceId ? await currentWorkspaceRevision(actor.workspaceId) : 0;
    return { data: { revision } };
  });
}
