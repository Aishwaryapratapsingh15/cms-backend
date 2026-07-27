import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_PERMISSIONS = [
  'users:create',
  'users:read',
  'users:update',
  'users:delete',
] as const;

const CATEGORY_PERMISSIONS = [
  'categories:create',
  'categories:read',
  'categories:update',
  'categories:delete',
] as const;

const TAG_PERMISSIONS = [
  'tags:create',
  'tags:read',
  'tags:update',
  'tags:delete',
] as const;

const BLOG_PERMISSIONS = [
  'blogs:create',
  'blogs:read',
  'blogs:update',
  'blogs:delete',
  // Scoping permissions, checked directly by BlogsService.update() (not just
  // the route guard) since they govern behavior *within* an already-permitted
  // call, not whether the route can be hit at all:
  // - manage-all: update a blog authored by someone else (without it,
  //   blogs:update only works on the actor's own posts — blogs:delete has no
  //   such scoping, it's all-or-nothing via the plain permission below).
  // - publish: set status to anything other than DRAFT, on create or update
  //   (without it, attempting PUBLISHED/SCHEDULED/ARCHIVED is a 403).
  'blogs:manage-all',
  'blogs:publish',
] as const;

const MEDIA_PERMISSIONS = [
  'media:create',
  'media:read',
  'media:update',
  'media:delete',
] as const;

const DASHBOARD_PERMISSIONS = ['dashboard:read'] as const;

const AUDIT_PERMISSIONS = ['audit:read'] as const;

const ALL_PERMISSIONS = [
  ...USER_PERMISSIONS,
  ...CATEGORY_PERMISSIONS,
  ...TAG_PERMISSIONS,
  ...BLOG_PERMISSIONS,
  ...MEDIA_PERMISSIONS,
  ...DASHBOARD_PERMISSIONS,
  ...AUDIT_PERMISSIONS,
] as const;

const ROLE_PERMISSIONS: Record<'ADMIN' | 'EDITOR' | 'AUTHOR', readonly string[]> = {
  // ADMIN alone gets audit:read — audit logs are a security/oversight concern,
  // not content, so this is a deliberate exception to EDITOR otherwise getting
  // full access everywhere else.
  ADMIN: ALL_PERMISSIONS,
  // EDITOR's own description is "Can manage content" — full access to content
  // resources (categories/tags/blogs/media) plus dashboard visibility, but only
  // read access to user management, and no access to the audit log.
  EDITOR: [
    'users:read',
    ...CATEGORY_PERMISSIONS,
    ...TAG_PERMISSIONS,
    ...BLOG_PERMISSIONS,
    ...MEDIA_PERMISSIONS,
    ...DASHBOARD_PERMISSIONS,
  ],
  // AUTHOR is a scoped content-contributor role: can write blogs, but only
  // ever their own (no blogs:manage-all) and only as DRAFT (no blogs:publish
  // — BlogsService enforces both, not just this grant list). Can create new
  // categories/tags in addition to reading them (so they aren't blocked from
  // tagging a post with a taxonomy that doesn't exist yet), but not update or
  // delete existing ones. Can upload media for their own posts, no user/audit
  // visibility at all.
  AUTHOR: [
    'blogs:create',
    'blogs:read',
    'blogs:update',
    'categories:create',
    'categories:read',
    'tags:create',
    'tags:read',
    'media:create',
    'media:read',
    'dashboard:read',
  ],
};

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Full system access',
    },
  });

  const editorRole = await prisma.role.upsert({
    where: { name: 'EDITOR' },
    update: {},
    create: {
      name: 'EDITOR',
      description: 'Can manage content',
    },
  });

  const authorRole = await prisma.role.upsert({
    where: { name: 'AUTHOR' },
    update: {},
    create: {
      name: 'AUTHOR',
      description: 'Can write and edit their own blog posts as drafts',
    },
  });

  const permissions = await Promise.all(
    ALL_PERMISSIONS.map((name) =>
      prisma.permission.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
  const permissionIdByName = new Map(
    permissions.map((permission) => [permission.name, permission.id]),
  );

  const roleByName = { ADMIN: adminRole, EDITOR: editorRole, AUTHOR: authorRole };

  for (const [roleName, permissionNames] of Object.entries(
    ROLE_PERMISSIONS,
  ) as [keyof typeof roleByName, readonly string[]][]) {
    const role = roleByName[roleName];

    for (const permissionName of permissionNames) {
      // Guaranteed present: permissionIdByName was populated from
      // ALL_PERMISSIONS, which every ROLE_PERMISSIONS entry draws from.
      const permissionId = permissionIdByName.get(permissionName)!;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
}

main()
  .then(() => {
    console.log('Seed completed.');
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
