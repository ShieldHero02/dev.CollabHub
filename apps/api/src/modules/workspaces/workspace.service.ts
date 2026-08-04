import { prisma } from "../../plugins/prisma.js";
import type { Role } from "@collabhub/domain";
import type { Prisma } from "@prisma/client";

export const defaultWorkspaceSlug = "main";

export async function ensureDefaultWorkspace() {
  return prisma.workspace.upsert({
    where: { slug: defaultWorkspaceSlug },
    create: {
      slug: defaultWorkspaceSlug,
      name: process.env.DEFAULT_WORKSPACE_NAME ?? "CollabHub"
    },
    update: {}
  });
}

export async function linkUserToWorkspace(userId: string, roleKey: Role, workspaceId?: string) {
  const workspace = workspaceId
    ? await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })
    : await ensureDefaultWorkspace();

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId
      }
    },
    create: {
      workspaceId: workspace.id,
      userId,
      roleKey
    },
    update: { roleKey }
  });

  return workspace;
}

export async function workspaceIdForUser(userId: string) {
  const link = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true }
  });
  if (link) return link.workspaceId;
  return (await linkUserToWorkspace(userId, "member")).id;
}

export async function bumpWorkspaceRevision(workspaceId: string, scope: string, actorUserId?: string) {
  return prisma.$transaction((tx) => bumpWorkspaceRevisionInTransaction(tx, workspaceId, scope, actorUserId));
}

export async function bumpWorkspaceRevisionInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  scope: string,
  actorUserId?: string
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
  const latest = await tx.syncRevision.findFirst({
    where: { workspaceId },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  const version = nextWorkspaceRevision(latest?.version ?? null);
  await tx.syncRevision.create({
    data: {
      workspaceId,
      version,
      scope,
      actorUserId: actorUserId ?? null
    }
  });
  return version;
}

export function nextWorkspaceRevision(latestVersion: number | null) {
  return (latestVersion ?? 0) + 1;
}

export async function currentWorkspaceRevision(workspaceId: string) {
  const latest = await prisma.syncRevision.findFirst({
    where: { workspaceId },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  return latest?.version ?? 0;
}
