-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('CONTENT', 'AVATAR');

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "type" "MediaType" NOT NULL DEFAULT 'CONTENT';

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
