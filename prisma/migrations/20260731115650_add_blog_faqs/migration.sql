-- CreateTable
CREATE TABLE "blog_faqs" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "blog_faqs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "blog_faqs" ADD CONSTRAINT "blog_faqs_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
