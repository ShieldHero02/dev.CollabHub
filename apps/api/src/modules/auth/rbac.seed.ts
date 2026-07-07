import { defaultRolePermissions, permissions, systemRoles, type Role } from "@collabhub/domain";
import { prisma } from "../../plugins/prisma.js";

export async function ensureSystemAccess() {
  const permissionRows = await Promise.all(
    permissions.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission },
        create: { key: permission },
        update: {}
      })
    )
  );
  const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission.id]));

  for (const [key, role] of Object.entries(systemRoles) as Array<[Role, (typeof systemRoles)[Role]]>) {
    const accessRole = await prisma.accessRole.upsert({
      where: { key },
      create: {
        key,
        name: role.label,
        isSystem: role.locked,
        isMasterManaged: true
      },
      update: {
        name: role.label,
        isSystem: role.locked,
        isMasterManaged: true
      }
    });

    for (const permission of defaultRolePermissions[key]) {
      const permissionId = permissionByKey.get(permission);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: accessRole.id,
            permissionId
          }
        },
        create: {
          roleId: accessRole.id,
          permissionId
        },
        update: {}
      });
    }
  }
}

export async function assignRoleByKey(userId: string, roleKey: Role) {
  const role = await prisma.accessRole.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`Role ${roleKey} is not seeded`);
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId: role.id
      }
    },
    create: {
      userId,
      roleId: role.id
    },
    update: {}
  });
}
