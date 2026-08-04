import type { FastifyInstance } from "fastify";
import { availabilityStatuses, canEditParticipant, canViewParticipant, isValidHour } from "@collabhub/domain";
import { z } from "zod";
import { forbidden } from "../../http/errors.js";
import { requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { bumpWorkspaceRevisionInTransaction } from "../workspaces/workspace.service.js";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  start: dateKeySchema,
  profileId: z.string().optional()
});

const saveWeekSchema = z.object({
  cells: z.array(
    z.object({
      date: dateKeySchema,
      hour: z.number().int().min(0).max(23),
      status: z.enum(availabilityStatuses),
      comment: z.string().max(500).optional()
    })
  ).max(24 * 7)
});

type SlotRow = {
  profileId: string;
  date: Date;
  hour: number;
  status: string;
};

type CommentRow = {
  profileId: string;
  date: Date;
  hour: number;
  body: string;
};

export async function registerAvailabilityRoutes(server: FastifyInstance) {
  server.get("/api/availability/week", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const query = querySchema.parse(request.query);
    const startDate = parseDateKey(query.start);
    const endDate = addDays(startDate, 6);
    if (!actor.workspaceId) {
      return { data: { startDate: query.start, endDate: toDateKey(endDate), cells: [] } };
    }
    const profileIds = await resolveVisibleProfileIds(actor, query.profileId);

    if (profileIds.length === 0) {
      return { data: { startDate: query.start, endDate: toDateKey(endDate), cells: [] } };
    }

    const [slots, comments] = await Promise.all([
      prisma.availabilitySlot.findMany({
        where: {
          profileId: { in: profileIds },
          date: { gte: startDate, lte: endDate }
        }
      }),
      prisma.availabilityComment.findMany({
        where: {
          profileId: { in: profileIds },
          date: { gte: startDate, lte: endDate }
        }
      })
    ]);

    const slotMap = new Map(
      (slots as SlotRow[]).map((slot) => [`${slot.profileId}:${toDateKey(slot.date)}:${slot.hour}`, slot.status])
    );
    const commentMap = new Map(
      (comments as CommentRow[]).map((comment) => [`${comment.profileId}:${toDateKey(comment.date)}:${comment.hour}`, comment.body])
    );

    const cells = profileIds.flatMap((profileId: string) =>
      Array.from({ length: 7 }, (_, dayOffset) => {
        const date = toDateKey(addDays(startDate, dayOffset));
        return Array.from({ length: 24 }, (_, hour) => {
          const key = `${profileId}:${date}:${hour}`;
          return {
            profileId,
            date,
            hour,
            status: slotMap.get(key) ?? "unknown",
            comment: commentMap.get(key) ?? ""
          };
        });
      }).flat()
    );

    return { data: { startDate: query.start, endDate: toDateKey(endDate), cells } };
  });

  server.put("/api/availability/profiles/:profileId/week", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const params = z.object({ profileId: z.string() }).parse(request.params);
    if (!actor.workspaceId) {
      return forbidden(reply, "You cannot edit a participant schedule without a workspace");
    }
    const profile = await prisma.participantProfile.findFirst({
      where: {
        id: params.profileId,
        workspaceId: actor.workspaceId
      },
      include: {
        teamMemberships: { select: { teamId: true } },
        leadingTeams: { select: { id: true } }
      }
    });
    if (!profile) {
      return forbidden(reply, "You cannot edit another workspace schedule");
    }
    const targetTeamIds = [...profile.teamMemberships.map((membership) => membership.teamId), ...profile.leadingTeams.map((team) => team.id)];
    if (!canEditParticipant(actor, params.profileId, targetTeamIds)) {
      return forbidden(reply, "You cannot edit this participant schedule");
    }

    const input = saveWeekSchema.parse(request.body);

    await prisma.$transaction(async (tx) => {
      for (const cell of input.cells) {
        if (!isValidHour(cell.hour)) continue;
        const date = parseDateKey(cell.date);
        await tx.availabilitySlot.upsert({
          where: {
            profileId_date_hour: {
              profileId: params.profileId,
              date,
              hour: cell.hour
            }
          },
          create: {
            profileId: params.profileId,
            date,
            hour: cell.hour,
            status: cell.status
          },
          update: { status: cell.status }
        });

        const body = cell.comment?.trim() ?? "";
        if (body) {
          await tx.availabilityComment.upsert({
            where: {
              profileId_date_hour: {
                profileId: params.profileId,
                date,
                hour: cell.hour
              }
            },
            create: {
              profileId: params.profileId,
              date,
              hour: cell.hour,
              body
            },
            update: { body }
          });
        } else {
          await tx.availabilityComment.deleteMany({
            where: {
              profileId: params.profileId,
              date,
              hour: cell.hour
            }
          });
        }
      }
      await bumpWorkspaceRevisionInTransaction(tx, profile.workspaceId, "availability", actor.id);
    });

    return { data: { saved: input.cells.length } };
  });
}

async function resolveVisibleProfileIds(actor: NonNullable<Awaited<ReturnType<typeof requireUser>>>, requestedProfileId?: string) {
  if (!actor.workspaceId) return [];
  const workspaceId = actor.workspaceId;
  if (requestedProfileId) {
    const profile = await prisma.participantProfile.findFirst({
      where: {
        id: requestedProfileId,
        workspaceId
      },
      select: {
        id: true,
        teamMemberships: { select: { teamId: true } },
        leadingTeams: { select: { id: true } }
      }
    });
    if (!profile) return [];
    const targetTeamIds = [...profile.teamMemberships.map((membership) => membership.teamId), ...profile.leadingTeams.map((team) => team.id)];
    return canViewParticipant(actor, profile.id, targetTeamIds) ? [profile.id] : [];
  }

  if (actor.permissions.includes("schedule:view:all")) {
    const profiles = await prisma.participantProfile.findMany({
      where: { workspaceId },
      select: { id: true }
    });
    return profiles.map((profile: { id: string }) => profile.id);
  }

  if (actor.permissions.includes("schedule:view:team") && actor.teamIds?.length) {
    const profiles = await prisma.participantProfile.findMany({
      where: {
        workspaceId,
        OR: [
          ...(actor.profileId ? [{ id: actor.profileId }] : []),
          { teamMemberships: { some: { teamId: { in: actor.teamIds } } } },
          { leadingTeams: { some: { id: { in: actor.teamIds } } } }
        ]
      },
      select: { id: true }
    });
    return profiles.map((profile) => profile.id);
  }

  return actor.profileId && canViewParticipant(actor, actor.profileId) ? [actor.profileId] : [];
}

function parseDateKey(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
