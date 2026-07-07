import type { FastifyInstance } from "fastify";
import { requirePermission, requireUser } from "../../http/auth.js";
import { prisma } from "../../plugins/prisma.js";
import { ensureSystemAccess } from "../auth/rbac.seed.js";

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ permission: { key: string } }>;
};

type PermissionRow = {
  id: string;
  key: string;
  description: string | null;
};

export async function registerRoleRoutes(server: FastifyInstance) {
  server.get("/api/roles", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return reply;
    await ensureSystemAccess();

    const roles = await prisma.accessRole.findMany({
      orderBy: { key: "asc" },
      include: {
        permissions: {
          include: { permission: true }
        }
      }
    });

    return {
      data: (roles as RoleRow[]).map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((link) => link.permission.key).sort()
      }))
    };
  });

  server.get("/api/permissions", async (request, reply) => {
    const user = await requirePermission(request, reply, "role:manage");
    if (!user) return reply;
    if (user.role !== "master") return reply.code(403).send({ error: "forbidden", message: "Only Master can manage permissions" });
    await ensureSystemAccess();

    const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });
    return {
      data: (permissions as PermissionRow[]).map((permission) => ({
        id: permission.id,
        key: permission.key,
        description: permission.description
      }))
    };
  });
}
