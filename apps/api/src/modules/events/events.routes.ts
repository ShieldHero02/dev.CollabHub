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
import { bumpWorkspaceRevision } from "../workspaces/workspace.service.js";

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

    const query = eventQuerySchema.parse(request.query);
    const events = await prisma.event.findMany({
      where: {
        workspaceId: actor.workspaceId,
        date: {
          gte: query.start ? parseDateKey(query.start) : undefined,
          lte: query.end ? parseDateKey(query.end) : undefined
        }
      },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
      include: {
        participants: {
          include: { profile: true }
        }
      }
    });

    return {
      data: events.map((event: any) => eventDto(event, actor.id, actor))
    };
  });

  server.post("/api/events", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!canCreateEvent(actor) || !actor.workspaceId) return forbidden(reply);

    const input = eventInputSchema.parse(request.body);
    if (!(await participantIdsBelongToWorkspace(input.participantIds, actor.workspaceId))) {
      return forbidden(reply, "Event participants must belong to your workspace");
    }
    const event = await prisma.event.create({
      data: {
        workspaceId: actor.workspaceId,
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
    await bumpWorkspaceRevision(actor.workspaceId, "events", actor.id);

    return reply.code(201).send({ data: eventDto(event, actor.id, actor) });
  });

  server.put("/api/events/:eventId", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const existing = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Event not found" });
    if (!actor.workspaceId || existing.workspaceId !== actor.workspaceId || !canEditEvent(actor, existing.createdByUserId, actor.id)) {
      return forbidden(reply);
    }

    const input = eventInputSchema.parse(request.body);
    if (!(await participantIdsBelongToWorkspace(input.participantIds, actor.workspaceId))) {
      return forbidden(reply, "Event participants must belong to your workspace");
    }
    const event = await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.eventParticipant.deleteMany({ where: { eventId: existing.id } });
      return tx.event.update({
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
    });
    await bumpWorkspaceRevision(actor.workspaceId, "events", actor.id);
    return { data: eventDto(event, actor.id, actor) };
  });

  server.put("/api/events/:eventId/response", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;
    if (!canRespondToEvent(actor) || !actor.profileId || !actor.workspaceId) return forbidden(reply);

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const input = z.object({ status: z.enum(eventParticipantStatuses) }).parse(request.body);
    const event = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!event || event.workspaceId !== actor.workspaceId) return reply.code(404).send({ error: "not_found", message: "Event not found" });

    await prisma.eventParticipant.upsert({
      where: {
        eventId_profileId: {
          eventId: event.id,
          profileId: actor.profileId
        }
      },
      create: {
        eventId: event.id,
        profileId: actor.profileId,
        status: input.status
      },
      update: { status: input.status }
    });
    await bumpWorkspaceRevision(actor.workspaceId, "events", actor.id);
    return { data: { ok: true } };
  });

  server.delete("/api/events/:eventId", async (request, reply) => {
    const actor = await requireUser(request, reply);
    if (!actor) return reply;

    const params = z.object({ eventId: z.string() }).parse(request.params);
    const event = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!event) return reply.code(404).send({ error: "not_found", message: "Event not found" });
    if (!actor.workspaceId || event.workspaceId !== actor.workspaceId || !canDeleteEvent(actor, event.createdByUserId, actor.id)) {
      return forbidden(reply);
    }

    await prisma.event.delete({ where: { id: event.id } });
    await bumpWorkspaceRevision(actor.workspaceId, "events", actor.id);
    return { data: { ok: true } };
  });
}

async function participantIdsBelongToWorkspace(participantIds: string[], workspaceId: string) {
  const uniqueParticipantIds = [...new Set(participantIds)];
  if (uniqueParticipantIds.length === 0) return true;

  const matchingProfiles = await prisma.participantProfile.count({
    where: {
      id: { in: uniqueParticipantIds },
      workspaceId
    }
  });
  return matchingProfiles === uniqueParticipantIds.length;
}

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
    canEdit: canEditEvent(actor, event.createdByUserId, actorUserId),
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
