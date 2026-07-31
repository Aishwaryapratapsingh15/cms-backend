// One-time cleanup for users soft-deleted before UsersService.remove() started
// mangling `email` on delete. Without this, those emails stay permanently
// unusable (email has a hard @unique constraint in the DB) even though the
// account shows as deleted everywhere in the app.
//
// Safe to re-run: only touches deleted users whose email doesn't already
// carry the "deleted-<timestamp>-" prefix, so a second run is a no-op.
//
// Run after building: node dist/scripts/backfill-deleted-user-emails.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const staleDeletedUsers = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      NOT: { email: { startsWith: 'deleted-' } },
    },
  });

  console.log(`Found ${staleDeletedUsers.length} deleted user(s) with an unmangled email.`);

  for (const user of staleDeletedUsers) {
    const timestamp = (user.deletedAt ?? new Date()).getTime();
    const newEmail = `deleted-${timestamp}-${user.email}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    console.log(`  ${user.email} -> ${newEmail}`);
  }

  console.log('Backfill complete.');
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
