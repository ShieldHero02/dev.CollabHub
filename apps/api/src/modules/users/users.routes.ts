import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { roles, type Role } from "@collabhub/domain";
import { z } from "zod";
import { requirePermission, requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { assignRoleByKey, ensureSystemAccess } from "../auth/rbac.seed.js";

const createUserSchema = z.object({
  login: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(200),
  email: z.string().trim().email().optional(),
  role: z.enum(roles).default("member"),
  displayName: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#55dd78"),
  interests: z.array(z.string().trim().min(1).max(40)).default([])
});

type UserListRow = {
  id: string;
  login: string;
  email: string | null;
  roleKey: string;
  status: string;
  profile: {
    id: string;
    displayName: string;
    color: string;
    avatarUrl: string | null;
    interests: string[];
  } | null;
  roleAssignments: Array<{ role: { key: string } }>;
};

type ParticipantRow = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  interests: string[];
};

export async function registerUserRoutes(server: FastifyInstance) {
  server.get("/api/users", async (request, reply) => {
    const user = await requirePermission(request, reply, "user:manage");
    if (!user) return reply;

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        profile: true,
        roleAssignments: { include: { role: true } }
      }
    });

    return {
      data: (users as UserListRow[]).map((item) => ({
        id: item.id,
        login: item.login,
        email: item.email,
        role: item.roleKey,
        status: item.status,
        profile: item.profile
          ? {
              id: item.profile.id,
              displayName: item.profile.displayName,
              color: item.profile.color,
              avatarUrl: item.profile.avatarUrl,
              interests: item.profile.interests
            }
          : null,
        roles: item.roleAssignments.map((assignment) => assignment.role.key)
      }))
    };
  });

  server.post("/api/users", async (request, reply) => {
    const actor = await requirePermission(request, reply, "user:manage");
    if (!actor) return reply;
    await ensureSystemAccess();

    const input = createUserSchema.parse(request.body);
    if (input.role === "master" && actor.role !== "master") {
      return reply.code(403).send({ error: "forbidden", message: "Only Master can create another master-level account" });
    }

    const passwordHash = await argon2.hash(input.password);
    const created = await prisma.user.create({
      data: {
        login: input.login,
        email: input.email,
        passwordHash,
        roleKey: input.role,
        profile: {
          create: {
            displayName: input.displayName,
            color: input.color,
            interests: input.interests
          }
        },
        preferences: {
          create: {}
        }
      },
      include: { profile: true }
    });
    await assignRoleByKey(created.id, input.role as Role);

    return reply.code(201).send({
      data: {
        id: created.id,
        login: created.login,
        role: created.roleKey,
        profileId: created.profile?.id ?? null
      }
    });
  });

  server.get("/api/participants", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return reply;

    const participants = await prisma.participantProfile.findMany({
      orderBy: { displayName: "asc" }
    });
    return {
      data: (participants as ParticipantRow[]).map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        color: profile.color,
        avatarUrl: profile.avatarUrl,
        interests: profile.interests
      }))
    };
  });
}
