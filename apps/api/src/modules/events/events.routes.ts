import type { FastifyInstance } from "fastify";
import {
  canCreateEvent,
  canDeleteEvent,
  canEditEvent,
  canRespondToEvent,
  canViewEvents,
  eventParticipantStatuses
} from "@collabhub/domain";
import { z } from "zod";
import { forbidden } from "../../http/errors.js";
import { requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { bumpWorkspaceRevisionInTransaction } from "../workspaces/workspace.service.js";
import type { Prisma } from "@prisma/client";


const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const eventInputSchema = z.object({
  title: z.string().trim().min(2).max(100),
  activity: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  date: dateKeySchema,
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  participantIds: z.array(z.string()).default([])
}).refine((input) => input.endHour > input.startHour, {
  message: "Event end hour must be later than start hour"
});

const eventQuerySchema = z.object({
  start: dateKeySchema.optional(),
  end: dateKeySchema.optional()
});

export async function registerEventRoutes(server: FastifyInstance) {
  server.get("/api/events", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!canViewEvents(actor) || !actor.workspaceId) return { data: [] };
    const actorWithTeams = await actorWithTeamIds(actor);

    const query = eventQuerySchema.parse(request.query);
    const dateFilter = {
      ...(query.start ? { gte: parseDateKey(query.start) } : {}),
      ...(query.end ? { lte: parseDateKey(query.end) } : {})
    };
    const events = await prisma.event.findMany({
      where: {
        workspaceId: actor.workspaceId,
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {})
      },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
      include: {
        participants: {
          include: { profile: true }
        }
      }
    });

    return {
      data: events.map((event: any) => eventDto(event, actor.id, actorWithTeams))
    };
  });

  server.post("/api/events", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!canCreateEvent(actor) || !actor.workspaceId) return forbidden(reply);

    const input = eventInputSchema.parse(request.body);
    const event = await prisma.$transaction(async (tx) => {
      if (!(await participantIdsBelongToWorkspace(tx, input.participantIds, actor.workspaceId!))) {
        throw new CrossWorkspaceParticipantError();
      }
      const created = await tx.event.create({
        data: {
          workspaceId: actor.workspaceId!,
          title: input.title,
          activity: input.activity || null,
          description: input.description || null,
          date: parseDateKey(input.date),
          startHour: input.startHour,
          endHour: input.endHour,
          createdByUserId: actor.id,
          participants: {
            create: input.participantIds.map((profileId: string) => ({
              profileId,
              status: profileId === actor.profileId ? "going" : "invited"
            }))
          }
        },
        include: { participants: { include: { profile: true } } }
      });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "events", actor.id);
      return created;
    }).catch((error) => {
      if (error instanceof CrossWorkspaceParticipantError) return null;
      throw error;
    });
    if (!event) return forbidden(reply, "Event participants must belong to your workspace");

    return reply.code(201).send({ data: eventDto(event, actor.id, actor) });
  });

  server.put("/api/events/:eventId", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const existing = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Event not found" });
    const actorWithTeams = await actorWithTeamIds(actor);
    if (!actor.workspaceId || existing.workspaceId !== actor.workspaceId || !canEditEvent(actorWithTeams, existing.createdByUserId, actor.id, existing.teamId)) {
      return forbidden(reply);
    }

    const input = eventInputSchema.parse(request.body);
    const event = await prisma.$transaction(async (tx) => {
      if (!(await participantIdsBelongToWorkspace(tx, input.participantIds, actor.workspaceId!))) {
        throw new CrossWorkspaceParticipantError();
      }
      await tx.eventParticipant.deleteMany({ where: { eventId: existing.id } });
      const updated = await tx.event.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          activity: input.activity || null,
          description: input.description || null,
          date: parseDateKey(input.date),
          startHour: input.startHour,
          endHour: input.endHour,
          participants: {
            create: input.participantIds.map((profileId: string) => ({
              profileId,
              status: profileId === actor.profileId ? "going" : "invited"
            }))
          }
        },
        include: { participants: { include: { profile: true } } }
      });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "events", actor.id);
      return updated;
    }).catch((error) => {
      if (error instanceof CrossWorkspaceParticipantError) return null;
      throw error;
    });
    if (!event) return forbidden(reply, "Event participants must belong to your workspace");
    return { data: eventDto(event, actor.id, actorWithTeams) };
  });

  server.put("/api/events/:eventId/response", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!canRespondToEvent(actor) || !actor.profileId || !actor.workspaceId) return forbidden(reply);

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const input = z.object({ status: z.enum(eventParticipantStatuses) }).parse(request.body);
    const event = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!event || event.workspaceId !== actor.workspaceId) return reply.code(404).send({ error: "not_found", message: "Event not found" });

    await prisma.$transaction(async (tx) => {
      await tx.eventParticipant.upsert({
        where: { eventId_profileId: { eventId: event.id, profileId: actor.profileId! } },
        create: { eventId: event.id, profileId: actor.profileId!, status: input.status },
        update: { status: input.status }
      });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "events", actor.id);
    });
    return { data: { ok: true } };
  });

  server.delete("/api/events/:eventId", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const event = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!event) return reply.code(404).send({ error: "not_found", message: "Event not found" });
    const actorWithTeams = await actorWithTeamIds(actor);
    if (!actor.workspaceId || event.workspaceId !== actor.workspaceId || !canDeleteEvent(actorWithTeams, event.createdByUserId, actor.id, event.teamId)) {
      return forbidden(reply);
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id: event.id } });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "events", actor.id);
    });
    return { data: { ok: true } };
  });
}

async function participantIdsBelongToWorkspace(tx: Prisma.TransactionClient, participantIds: string[], workspaceId: string) {
  const uniqueParticipantIds = [...new Set(participantIds)];
  if (uniqueParticipantIds.length === 0) return true;

  const matchingProfiles = await tx.participantProfile.count({
    where: {
      id: { in: uniqueParticipantIds },
      workspaceId
    }
  });
  return matchingProfiles === uniqueParticipantIds.length;
}

async function actorWithTeamIds<T extends { profileId: string | null; workspaceId: string | null }>(actor: T) {
  if (!actor.profileId || !actor.workspaceId) return { ...actor, teamIds: [] };
  const teams = await prisma.team.findMany({
    where: {
      workspaceId: actor.workspaceId,
      OR: [{ leadProfileId: actor.profileId }, { members: { some: { profileId: actor.profileId } } }]
    },
    select: { id: true }
  });
  return { ...actor, teamIds: teams.map((team) => team.id) };
}

class CrossWorkspaceParticipantError extends Error {}

function eventDto(event: any, actorUserId: string, actor: any) {
  return {
    id: event.id,
    title: event.title,
    activity: event.activity,
    description: event.description,
    date: toDateKey(event.date),
    startHour: event.startHour,
    endHour: event.endHour,
    createdByUserId: event.createdByUserId,
    canEdit: canEditEvent(actor, event.createdByUserId, actorUserId, event.teamId),
    participants: event.participants.map((link: any) => ({
      profileId: link.profileId,
      displayName: link.profile.displayName,
      color: link.profile.color,
      status: link.status
    }))
  };
}

function parseDateKey(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
