import { prisma } from "../../plugins/prisma.js";
import type { Role } from "@collabhub/domain";

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
  const latest = await prisma.syncRevision.findFirst({
    where: { workspaceId },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  const version = (latest?.version ?? 0) + 1;
  await prisma.syncRevision.create({
    data: {
      workspaceId,
      version,
      scope,
      actorUserId: actorUserId ?? null
    }
  });
  return version;
}

export async function currentWorkspaceRevision(workspaceId: string) {
  const latest = await prisma.syncRevision.findFirst({
    where: { workspaceId },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  return latest?.version ?? 0;
}
