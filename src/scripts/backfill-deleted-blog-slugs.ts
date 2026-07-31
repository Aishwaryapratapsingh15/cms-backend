// One-time cleanup for blogs soft-deleted before BlogsService.remove() started
// mangling `slug` on delete. Without this, those slugs stay permanently
// unusable (slug has a hard @unique constraint in the DB) even though the
// post shows as deleted everywhere in the app.
//
// Safe to re-run: only touches deleted blogs whose slug doesn't already
// carry the "deleted-<timestamp>-" prefix, so a second run is a no-op.
//
// Run after building: node dist/scripts/backfill-deleted-blog-slugs.js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const staleDeletedBlogs = await prisma.blog.findMany({
    where: {
      deletedAt: { not: null },
      NOT: { slug: { startsWith: 'deleted-' } },
    },
  });

  console.log(`Found ${staleDeletedBlogs.length} deleted blog(s) with an unmangled slug.`);

  for (const blog of staleDeletedBlogs) {
    const timestamp = (blog.deletedAt ?? new Date()).getTime();
    const newSlug = `deleted-${timestamp}-${blog.slug}`;

    await prisma.blog.update({
      where: { id: blog.id },
      data: { slug: newSlug },
    });

    console.log(`  ${blog.slug} -> ${newSlug}`);
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
