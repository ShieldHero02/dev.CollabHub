import type { FastifyInstance } from "fastify";
import { hasPermission, roles, type Permission, type Role } from "@collabhub/domain";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePermission, requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { ensureSystemAccess } from "../auth/rbac.seed.js";
import { hashPassword } from "../auth/passwords.js";
import { bumpWorkspaceRevisionInTransaction, ensureDefaultWorkspace } from "../workspaces/workspace.service.js";

const createUserSchema = z.object({
  login: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(200),
  email: z.string().trim().email().optional(),
  role: z.enum(roles).default("member"),
  displayName: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#55dd78"),
  interests: z.array(z.string().trim().min(1).max(40)).default([])
});

const updateUserSchema = z.object({
  role: z.enum(roles).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  displayName: z.string().trim().min(2).max(80).optional()
}).refine((input) => input.role !== undefined || input.status !== undefined || input.displayName !== undefined, {
  message: "At least one user field must be provided"
});

const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(12).max(200)
});

const roleRank: Record<Role, number> = {
  master: 6,
  head_admin: 5,
  admin: 4,
  manager: 3,
  teamlead: 2,
  member: 1,
  viewer: 0
};

export function canManageTargetRole(actorRole: Role, targetRole: Role) {
  return targetRole !== "master" && roleRank[targetRole] < roleRank[actorRole];
}

export function canAssignRole(actorRole: Role, nextRole: Role) {
  return nextRole !== "master" && roleRank[nextRole] < roleRank[actorRole];
}

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
    if (!user.workspaceId) return { data: [] };

    const users = await prisma.user.findMany({
      where: {
        workspaceLinks: {
          some: { workspaceId: user.workspaceId }
        }
      },
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
        status: publicAccountStatus(item.status),
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
    const workspace = actor.workspaceId
      ? await prisma.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId } })
      : await ensureDefaultWorkspace();
    if (!canAssignRole(actor.role, input.role)) {
      return reply.code(403).send({ error: "forbidden", message: "You cannot create an account at or above your role level" });
    }

    const passwordHash = await hashPassword(input.password);
    const role = await prisma.accessRole.findUniqueOrThrow({ where: { key: input.role } });
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login: input.login,
          email: input.email ?? null,
          passwordHash,
          roleKey: input.role,
          profile: {
            create: {
              displayName: input.displayName,
              workspaceId: workspace.id,
              color: input.color,
              interests: input.interests
            }
          },
          preferences: { create: {} }
        },
        include: { profile: true }
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleKey: input.role } });
      await bumpWorkspaceRevisionInTransaction(tx, workspace.id, "users", actor.id);
      return user;
    });

    return reply.code(201).send({
      data: {
        id: created.id,
        login: created.login,
        role: created.roleKey,
        profileId: created.profile?.id ?? null
      }
    });
  });

  server.patch("/api/users/:userId", async (request, reply) => {
    const actor = await requirePermission(request, reply, "user:manage");
    if (!actor) return reply;
    if (!actor.workspaceId) return reply.code(409).send({ error: "missing_workspace", message: "Account has no workspace" });

    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const target = await prisma.user.findFirst({
      where: { id: userId, workspaceLinks: { some: { workspaceId: actor.workspaceId } } },
      include: { profile: true }
    });
    if (!target) return reply.code(404).send({ error: "not_found", message: "User not found" });
    const targetRole = target.roleKey as Role;

    if (input.status === "disabled" && target.id === actor.id) {
      return reply.code(409).send({ error: "self_disable_forbidden", message: "You cannot disable your own account" });
    }
    if (!canManageTargetRole(actor.role, targetRole)) {
      return reply.code(403).send({ error: "forbidden", message: "You cannot manage this user" });
    }
    if (input.role && !canAssignRole(actor.role, input.role)) {
      return reply.code(403).send({ error: "forbidden", message: "You cannot assign a role at or above your role level" });
    }

    const role = input.role ? await prisma.accessRole.findUniqueOrThrow({ where: { key: input.role } }) : null;
    const result = await prisma.$transaction(async (tx) => {
      await lockUsersForManagement(tx, actor.id, target.id);
      const [currentActor, currentTarget] = await Promise.all([
        loadManagementActor(tx, actor.id),
        tx.user.findFirst({
          where: { id: target.id, workspaceLinks: { some: { workspaceId: actor.workspaceId! } } },
          include: { profile: true }
        })
      ]);
      if (!currentActor || !currentTarget) throw new ManagementPolicyError(404, "not_found", "User not found");
      const currentActorRole = currentActor.roleKey as Role;
      const currentTargetRole = currentTarget.roleKey as Role;
      if (!actorCanManageUsers(currentActor, currentActorRole)) {
        throw new ManagementPolicyError(403, "forbidden", "User management permission was revoked");
      }
      if (input.status === "disabled" && currentTarget.id === currentActor.id) {
        throw new ManagementPolicyError(409, "self_disable_forbidden", "You cannot disable your own account");
      }
      if (!canManageTargetRole(currentActorRole, currentTargetRole)) {
        throw new ManagementPolicyError(403, "forbidden", "You cannot manage this user");
      }
      if (input.role && !canAssignRole(currentActorRole, input.role)) {
        throw new ManagementPolicyError(403, "forbidden", "You cannot assign a role at or above your role level");
      }
      const transactionNextRole = input.role ?? currentTargetRole;
      await tx.user.update({
        where: { id: currentTarget.id },
        data: { roleKey: transactionNextRole, ...(input.status ? { status: input.status === "disabled" ? "suspended" : "active" } : {}) }
      });
      if (input.displayName && currentTarget.profile) {
        await tx.participantProfile.update({ where: { id: currentTarget.profile.id }, data: { displayName: input.displayName } });
      }
      if (role) {
        await tx.userRole.deleteMany({ where: { userId: currentTarget.id } });
        await tx.userRole.create({ data: { userId: currentTarget.id, roleId: role.id } });
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId: actor.workspaceId!, userId: currentTarget.id } },
          data: { roleKey: transactionNextRole }
        });
      }
      if (input.status === "disabled") await tx.session.deleteMany({ where: { userId: currentTarget.id } });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "users", actor.id);
      return {
        id: currentTarget.id,
        role: transactionNextRole,
        status: input.status ?? publicAccountStatus(currentTarget.status),
        displayName: input.displayName ?? currentTarget.profile?.displayName ?? null
      };
    }).catch(handleManagementPolicyError);
    if (result instanceof ManagementPolicyError) {
      return reply.code(result.statusCode).send({ error: result.code, message: result.message });
    }
    return {
      data: result
    };
  });

  server.put("/api/users/:userId/password", async (request, reply) => {
    const actor = await requirePermission(request, reply, "user:manage");
    if (!actor) return reply;
    if (!actor.workspaceId) return reply.code(409).send({ error: "missing_workspace", message: "Account has no workspace" });

    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const input = resetPasswordSchema.parse(request.body);
    const target = await prisma.user.findFirst({
      where: { id: userId, workspaceLinks: { some: { workspaceId: actor.workspaceId } } },
      select: { id: true, roleKey: true }
    });
    if (!target) return reply.code(404).send({ error: "not_found", message: "User not found" });
    if (!canManageTargetRole(actor.role, target.roleKey as Role)) {
      return reply.code(403).send({ error: "forbidden", message: "You cannot reset this user's password" });
    }

    const passwordHash = await hashPassword(input.temporaryPassword);
    const resetResult = await prisma.$transaction(async (tx) => {
      await lockUsersForManagement(tx, actor.id, target.id);
      const [currentActor, currentTarget] = await Promise.all([
        loadManagementActor(tx, actor.id),
        tx.user.findFirst({
          where: { id: target.id, workspaceLinks: { some: { workspaceId: actor.workspaceId! } } },
          select: { id: true, roleKey: true }
        })
      ]);
      if (!currentActor || !currentTarget) throw new ManagementPolicyError(404, "not_found", "User not found");
      const currentActorRole = currentActor.roleKey as Role;
      if (!actorCanManageUsers(currentActor, currentActorRole) || !canManageTargetRole(currentActorRole, currentTarget.roleKey as Role)) {
        throw new ManagementPolicyError(403, "forbidden", "You cannot reset this user's password");
      }
      await tx.user.update({ where: { id: currentTarget.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: currentTarget.id } });
      await bumpWorkspaceRevisionInTransaction(tx, actor.workspaceId!, "users", actor.id);
      return true;
    }).catch(handleManagementPolicyError);
    if (resetResult instanceof ManagementPolicyError) {
      return reply.code(resetResult.statusCode).send({ error: resetResult.code, message: resetResult.message });
    }
    return { data: { ok: true } };
  });

  server.get("/api/participants", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return reply;
    if (!user.workspaceId) return { data: [] };

    const participants = await prisma.participantProfile.findMany({
      where: { workspaceId: user.workspaceId },
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

function publicAccountStatus(status: string) {
  return status === "suspended" ? "disabled" : status;
}

async function lockUsersForManagement(tx: Prisma.TransactionClient, ...userIds: string[]) {
  for (const userId of [...new Set(userIds)].sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
  }
}

async function loadManagementActor(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        include: { role: { include: { permissions: { include: { permission: true } } } } }
      }
    }
  });
}

function actorCanManageUsers(actor: NonNullable<Awaited<ReturnType<typeof loadManagementActor>>>, role: Role) {
  const permissions = actor.roleAssignments.flatMap((assignment) =>
    assignment.role.permissions.map((link) => link.permission.key as Permission)
  );
  return hasPermission({ role, profileId: null, permissions }, "user:manage");
}

class ManagementPolicyError extends Error {
  constructor(readonly statusCode: 403 | 404 | 409, readonly code: string, message: string) {
    super(message);
  }
}

function handleManagementPolicyError(error: unknown) {
  if (error instanceof ManagementPolicyError) return error;
  throw error;
}
