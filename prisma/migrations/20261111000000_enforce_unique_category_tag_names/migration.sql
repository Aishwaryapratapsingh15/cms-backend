-- Enforce case-insensitive unique names for categories and tags.
-- Existing duplicates are merged first (oldest row wins, every blog link is
-- re-pointed to it) so the index can be created on live data.

-- ---------- categories ----------
UPDATE "categories"
SET "name" = btrim(regexp_replace("name", '\s+', ' ', 'g'))
WHERE "name" <> btrim(regexp_replace("name", '\s+', ' ', 'g'));

CREATE TEMP TABLE "_category_dupes" AS
SELECT "id", "keep_id"
FROM (
  SELECT "id",
         first_value("id") OVER (PARTITION BY lower("name") ORDER BY "createdAt", "id") AS "keep_id"
  FROM "categories"
) ranked
WHERE "id" <> "keep_id";

INSERT INTO "blog_categories" ("blogId", "categoryId")
SELECT bc."blogId", d."keep_id"
FROM "blog_categories" bc
JOIN "_category_dupes" d ON d."id" = bc."categoryId"
ON CONFLICT DO NOTHING;

DELETE FROM "blog_categories" WHERE "categoryId" IN (SELECT "id" FROM "_category_dupes");
DELETE FROM "categories" WHERE "id" IN (SELECT "id" FROM "_category_dupes");
DROP TABLE "_category_dupes";

CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (lower("name"));

-- ---------- tags ----------
UPDATE "tags"
SET "name" = btrim(regexp_replace("name", '\s+', ' ', 'g'))
WHERE "name" <> btrim(regexp_replace("name", '\s+', ' ', 'g'));

CREATE TEMP TABLE "_tag_dupes" AS
SELECT "id", "keep_id"
FROM (
  SELECT "id",
         first_value("id") OVER (PARTITION BY lower("name") ORDER BY "createdAt", "id") AS "keep_id"
  FROM "tags"
) ranked
WHERE "id" <> "keep_id";

INSERT INTO "blog_tags" ("blogId", "tagId")
SELECT bt."blogId", d."keep_id"
FROM "blog_tags" bt
JOIN "_tag_dupes" d ON d."id" = bt."tagId"
ON CONFLICT DO NOTHING;

DELETE FROM "blog_tags" WHERE "tagId" IN (SELECT "id" FROM "_tag_dupes");
DELETE FROM "tags" WHERE "id" IN (SELECT "id" FROM "_tag_dupes");
DROP TABLE "_tag_dupes";

CREATE UNIQUE INDEX "tags_name_lower_key" ON "tags" (lower("name"));
