# EICE CMS Backend

Production-grade CMS backend for EICE Technology. Not a tutorial project — build as if
multiple organizations will run this in production. Follow NestJS best practices and
enterprise architecture strictly; no shortcuts, no dummy/stub code left behind.

## Tech Stack

- NestJS 11 + TypeScript, Prisma ORM, PostgreSQL
- Auth: JWT, Passport, Passport-JWT, bcrypt
- Validation: class-validator, class-transformer
- Docs: Swagger (`@nestjs/swagger`, served at `/docs`)
- Media: AWS S3 (`@aws-sdk/client-s3`) + CloudFront (`src/media/`)
- Future: Redis (optional), BullMQ, cron jobs

## Architecture Rules

1. **Feature-based structure** — organize by domain (`auth/`, `users/`, `blogs/`, `media/`,
   `settings/`), never by file type.
2. **Layering is one-way**: Controller → Service → PrismaService → DB. Controllers only
   receive the request, validate via DTO, call a service, and return the result — no
   business logic and no direct Prisma access in controllers.
3. **Services own all business logic**: hashing, permission checks, slug generation,
   publishing/versioning logic, etc.
4. **Every request uses a DTO** with class-validator decorators. Never accept raw objects.
5. **Never expose** `password`, password hashes, or refresh-token hashes in any response —
   strip them in the service layer before returning.
6. **JWT payload contains only** `sub`, `email`, `role`. Never put password, permissions,
   or profile fields in the token.
7. **Standard response envelope**, enforced globally via a response interceptor and
   exception filter (see `common/`), not ad-hoc per-controller:
   ```json
   { "success": true, "message": "...", "data": {} }
   { "success": false, "message": "...", "errors": [] }
   ```

## Target Folder Structure

```
src/
  auth/        dto, guards, decorators, strategies, interfaces
  users/       dto
  blogs/ categories/ tags/ media/ dashboard/ settings/ audit/
  prisma/
  common/      filters, interceptors, decorators, guards, utils, constants
  config/
  seed/
```

## Current Status (verify before trusting — check the actual files)

Prisma schema (`prisma/schema.prisma`) is well ahead of the remaining app code: `Role`,
`Permission`, `RolePermission`, `User` (with soft delete), `RefreshToken`, `Media`,
`Blog` (status enum, SEO fields, versioning via `BlogVersion`), `Category`, `Tag`,
join tables, `Setting`. Extend this schema rather than redesigning it.

Done (Steps 1-4 below): bootstrap `POST /users`, real `POST /auth/login` (bcrypt
compare, JWT + opaque refresh token, `lastLogin` update), Passport JWT strategy
(`src/auth/strategies/jwt.strategy.ts`, re-validates the user against the DB on every
request), and a **global** `JwtAuthGuard` (`src/auth/guards/jwt-auth.guard.ts`,
registered as `APP_GUARD` in `auth.module.ts`) with an `@Public()` escape hatch
(`src/auth/decorators/public.decorator.ts`) — every new controller route is protected
by default unless explicitly marked `@Public()`. `ConfigModule.forRoot({ isGlobal: true
})` is wired in `app.module.ts`, and `common/` has the global response
interceptor/exception filter. `seed/seed.ts` seeds `ADMIN`/`EDITOR` roles (`npm run
seed`).

`RefreshToken.tokenHash` is `@unique` (migration `20260717152904_add_unique_refresh_token_hash`)
so refresh/logout can look it up by exact hash match. Refresh rotates tokens (old row
deleted, new pair issued); logout deletes the specific token, scoped to the caller's own
`userId` (`deleteMany`, so it's idempotent). `AuthenticatedUser`
(`src/auth/interfaces/authenticated-user.interface.ts`) is the real type for
`@CurrentUser()`/`req.user` — use it instead of the near-empty ambient `Express.User`.

RBAC is wired: `PermissionsGuard` (`src/auth/guards/permissions.guard.ts`) is a second
global guard (registered after `JwtAuthGuard` in `auth.module.ts` — order matters, it
needs `req.user` already populated), opt-in via `@Permissions('resource:action')`
(`src/auth/decorators/permissions.decorator.ts`) — routes with no `@Permissions()`
metadata are unaffected. It checks the caller's `RolePermission` grants fresh from the DB
every request (same freshness rationale as `JwtStrategy`), never special-cases a role
name in code. `seed/seed.ts` currently seeds only the `users:*` permission catalog
(`create`/`read`/`update`/`delete` — scoped to what Step 9 needs next): `ADMIN` gets all
four, `EDITOR` gets `users:read` only. Extend the catalog per-resource as each new step
(blogs, media, etc.) actually adds endpoints — don't invent permissions ahead of the
endpoints that need them.

Users CRUD is done: `GET /users` (paginated, `search` over `fullName`/`email`,
`sortBy`/`sortOrder` restricted to a small allow-list), `GET /users/:id`, `PATCH
/users/:id` (including reassigning `roleId`), `DELETE /users/:id` (soft delete via
`deletedAt`, blocks deleting your own account). All gated by
`@Permissions('users:read'|'update'|'delete')` — the first real consumer of Step 8's
RBAC. `UsersService` uses a shared `SAFE_USER_SELECT` Prisma `select` (never fetches
`password` in the first place, stricter than the fetch-then-strip pattern `login`/
bootstrap `create` still use). Live-verified that permission checks are fresh per
request: changed a running admin's own `roleId` to `EDITOR` mid-session with a
still-valid access token, and the very next request with that same token correctly lost
`users:update`/`users:delete` while keeping `users:read`.

**Known gap, not yet addressed**: there is still no authenticated way to *create*
additional users after the one-time bootstrap (`POST /users` only works once). Not part
of Step 9's stated scope — revisit if/when needed.

Categories and Tags CRUD are done (`src/categories/`, `src/tags/`, mirroring
`UsersController`'s shape): create/list/get/patch/delete, `@Permissions('categories:...'
|'tags:...')`-gated (seeded — `ADMIN` and `EDITOR` both get full access, since content
management is `EDITOR`'s whole purpose, unlike `users:*` where `EDITOR` is read-only).
Slugs are handled by a shared `src/common/utils/slug.util.ts` (`slugify` +
`generateUniqueSlug`) — omit `slug` and one is auto-generated from `name` with
`-2`/`-3`... de-duplication; provide one explicitly and it's validated for exact
uniqueness (`409` if taken). Renaming `name` alone never silently changes an existing
`slug`. Both entities use **hard delete** (no `deletedAt` column, unlike `User`) — a
delete blocked by a future `BlogCategory`/`BlogTag` FK reference is caught and turned
into a clean `409` rather than a raw Prisma error. `src/common/dto/pagination-query.dto.ts`
is now the shared `page`/`limit`/`sortOrder` base for all list DTOs (`ListUsersQueryDto`
was retrofitted onto it too).

Blogs is done (`src/blogs/`) — the largest module so far: full CRUD, a **public**
`GET /blogs/slug/:slug` (`@Public()`, confirmed with the user), status workflow
(`DRAFT`/`PUBLISHED`/`SCHEDULED`/`ARCHIVED`), and versioning/rollback via `BlogVersion`.
Specifics worth knowing before touching this module:
- The public slug route only ever returns `status === 'PUBLISHED'` (draft/scheduled/
  archived 404 regardless of caller) and increments `views` on every hit (no dedup —
  no session/IP tracking infra exists). Everything else under `/blogs` stays behind
  `@Permissions('blogs:...')`, seeded like categories/tags (`ADMIN` + `EDITOR` full
  access).
- Status side effects live in `BlogsService.resolveStatusFields`: `PUBLISHED` sets
  `publishedAt` only if not already set (doesn't reset history on re-save); `SCHEDULED`
  requires a real future `scheduledAt` (`400` otherwise) and **clears `publishedAt`**;
  leaving `SCHEDULED`/`ARCHIVED` clears their respective timestamp. No cron exists to
  auto-flip `SCHEDULED` → `PUBLISHED` when the date arrives — that's out of scope until
  scheduler infra exists.
- A `BlogVersion` snapshot is only created when `title`/`excerpt`/`content` actually
  change (not on metadata-only edits), `editedById` = whoever made *that* edit. Rollback
  (`POST /blogs/:id/versions/:versionId/rollback`) reuses the same update path, so a
  rollback is itself a new, further-rollback-able version.
- `categoryIds`/`tagIds` use full-replace semantics on `PATCH` (only touched if the key
  is present in the body) inside a `$transaction` alongside the version snapshot and
  scalar update. Response shape flattens the join rows (`categories: [{id, name,
  slug}]`, not the raw `BlogCategory` wrapper).
- `readingTime` is server-computed (word count / 200wpm) and not client-settable at all.
- `seoTitle`/`seoDescription`/`canonicalUrl` are plain pass-through fields here — Step 13
  is specifically about *auto-generating* them when omitted, not built yet.
- No ownership scoping (any `blogs:*` grant works on any blog, not just ones the caller
  authored) — same flat model as Users/Categories/Tags.
- **Caught and fixed during live verification**: the first implementation forgot to
  clear `publishedAt` on the `SCHEDULED` transition (contradicting the approved plan) —
  a live PATCH-to-SCHEDULED check on a previously-published post surfaced it
  immediately; fixed and covered with a regression test before moving on.

Media is code-complete (`src/media/`), but **not live-verified against real AWS, and the
user has explicitly said not to pursue that** ("can't give you creds, complete the
rest") — treat this as a deliberate, closed decision, not a pending task to revisit
unprompted. The 5 AWS env var placeholders exist in `.env` (`AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`,
`AWS_CLOUDFRONT_DOMAIN`) but are empty/incomplete and are expected to stay that way for
now. **Important fix already made because of this**: `MediaService`'s `S3Client` is
built **lazily** (`getS3Client()`, memoized after first call) rather than in the
constructor — the first implementation built it eagerly, which crashed the *entire app*
at boot (Nest instantiates every provider eagerly, and the AWS SDK throws synchronously
on an incomplete region) as soon as these vars were added, not just `/media`. Verified
live: the app now boots fine and auth/users/etc. all work normally with incomplete AWS
config — only an actual `POST`/`DELETE` `/media` call would fail (a normal, contained
`500` from the AWS SDK, not a server crash), which is the correct and accepted state
until real credentials are ever provided. Don't re-eagerly-construct AWS clients in a
provider constructor again for this reason.
- Direct multipart upload (`FileInterceptor`, `memoryStorage()` — no disk writes),
  allow-listed mimetypes (`image/jpeg|png|webp|gif`, `application/pdf`), 10MB cap,
  enforced via multer's `fileFilter`/`limits`. Multer's own size-limit error
  (`MulterError`, not a NestJS `HttpException`) is now handled by
  `AllExceptionsFilter` (`src/common/filters/http-exception.filter.ts`) → clean `400`.
- `width`/`height` extracted via `image-size` for image mimetypes only.
- `fileSize` is Prisma `BigInt` — converted to `Number` in the response mapper (raw
  `BigInt` fails `JSON.stringify`). Response includes a computed `url` (CloudFront
  domain + `s3Key`), not stored in the DB.
- Hard delete (no `deletedAt` on `Media`): DB delete first (FK conflict from
  `Blog.featuredMediaId` → `409`, same pattern as Categories/Tags), S3 object deleted
  only after the DB delete succeeds; an S3-side delete failure is logged but does not
  fail the request (DB is already consistent — an orphaned S3 object is the better
  failure mode than a dangling DB row).
- No public read endpoint — media is actually served by hitting the CloudFront URL
  directly, entirely outside this API, so `GET /media` metadata stays permission-gated
  like everything else.

SEO auto-fill is done, scoped entirely to `BlogsService.create()` — `update()` needed
**zero changes**. If a client omits `seoTitle`/`seoDescription`/`canonicalUrl` when
creating a blog: `seoTitle` defaults to `title` (truncated 60 chars), `seoDescription`
defaults to `excerpt` if present else `content` with markdown stripped (truncated 160
chars, both via the new `src/common/utils/text.util.ts` — `truncate`/`stripMarkdown`,
same spirit as `slug.util.ts`), and `canonicalUrl` defaults to
`${PUBLIC_SITE_URL}/blog/{slug}` **only if** the new (optional, non-crashing —
`ConfigService.get()` not `getOrThrow()`) `PUBLIC_SITE_URL` env var is set, otherwise
stays `null`. Once a blog exists, these are just regular fields — editing `title`/
`excerpt`/`content` later never silently regenerates a previously-auto-filled SEO
field, only an explicit `PATCH` with that exact key changes it (same precedent as
slugs never changing on rename). Live-verified: long markdown content correctly
stripped/truncated on create, explicit SEO fields passed through as-is, and a
`title`-only `PATCH` left the auto-filled `seoTitle` untouched.

Dashboard stats is done (`src/dashboard/`) — a single `GET /dashboard/stats`
(`@Permissions('dashboard:read')`, seeded for both roles) returning `totalUsers`,
`totalBlogs`, `totalCategories`, `totalViews` (summed), and `blogsByStatus` (all 4
`BlogStatus` values always present, zero-filled if a bucket has no rows — `groupBy`
only returns buckets that actually exist). All 5 queries run via `Promise.all`. Counts
exclude soft-deleted `User`/`Blog` rows; `Category` has no such column. Not scoped:
tags/media counts, date-range filtering — not named in the roadmap, cheap to add if
asked. Live-verified the counts against real created data (1 category, 1 draft blog, 1
published blog with 3 recorded views) matched exactly.

Audit log is done (`src/audit/`, new `AuditLog` table — migration
`20260717173406_add_audit_log`). Cross-cutting, **opt-in via `@Audit(entity, action?)`**
on specific handlers (same shape as `@Permissions()`), enforced by a global
`AuditLogInterceptor` (second `APP_INTERCEPTOR`, alongside `ResponseInterceptor` —
order between them doesn't matter, the interceptor defensively unwraps the
`{success,message,data}` envelope if present). Decorated **only** the create/update/
delete handlers on `UsersController`, `CategoriesController`, `TagsController`,
`BlogsController` (including the rollback route, statically forced to `UPDATE` since
it's a `POST`), `MediaController`, and `AuthController.login` (statically forced to
`LOGIN`) — everything else (all `GET`s, `/auth/refresh`, `/auth/logout`) is
deliberately un-audited, matching the exact action vocabulary asked for
(login/create/update/delete/publish/unpublish). No existing service logic was touched
to build this — purely additive decorators plus one cross-cutting interceptor.
- **Publish/unpublish has no static decorator** — on any `Blog` `PATCH` where the
  request body includes a `status` key, the interceptor reads the *response's*
  resulting status and logs `PUBLISH` if it's now `PUBLISHED`, else `UNPUBLISH`. A
  status-less `PATCH` (e.g. just `isFeatured`) logs as a plain `UPDATE`.
  `BlogsService` needed zero changes for this.
- **`userId` fallback chain**: `req.user.id` when authenticated; for the two routes with
  no authenticated actor (login itself, and the one-time bootstrap `POST /users`) it
  falls back to the response's own `user.id`/`id` — a self-action, not `null`.
- `entityId` comes from the response body's `id` (creates) or the `:id` route param
  (updates/deletes — delete handlers return `{}`, nothing to read from the body there).
- The DB write is `await`ed (not fire-and-forget) but wrapped in try/catch —
  `AuditLogService.record()` logs and swallows any failure, never turning a successful
  mutation into a failed response.
- **`audit:read` is `ADMIN`-only** — the first deliberate exception to "`EDITOR` gets
  full access everywhere," since audit logs are a security/oversight concern, not
  content. Live-verified: the same self-role-change trick from Step 9 confirmed `EDITOR`
  gets a clean `403` on `GET /audit`.
- Live-verified the full chain end-to-end in one session: bootstrap → login → create
  category → create/publish/unpublish blog → delete category, then confirmed all 7
  resulting rows in `GET /audit` had the correct `who`/`action`/`entity`/`entityId`/
  `ipAddress`, in the right order, plus entity/action filtering worked.

Production hardening is done — the final roadmap step:
- **Helmet** + **compression**, plain `app.use()` in `main.ts`, defaults only.
- **CORS**: `CORS_ORIGINS` (comma-separated, optional) in `.env`; unset → reflects any
  origin (`origin: true`), matching the project's current open-dev posture. Needs a
  real value before real production use — not asked from the user now since there's no
  frontend yet and, unlike AWS creds, this isn't a blocker (cheap env var to add later).
- **Rate limiting**: `@nestjs/throttler`, global `ThrottlerGuard` (third `APP_GUARD`,
  registered in `CommonModule` — imported before `AuthModule` so it rejects over-limit
  traffic before any DB-backed auth check runs), configurable via `THROTTLE_TTL`/
  `THROTTLE_LIMIT`. `POST /auth/login` has a stricter `@Throttle` override (5/60s,
  brute-force protection); `GET /health` has `@SkipThrottle()` (load balancers poll it
  constantly). Live-verified: a 6th rapid login attempt got `429`, `/health` stayed
  `200` throughout, and login worked normally again once the window reset.
- **Env validation**: `src/config/env.validation.ts`, a `class-validator`-based
  `EnvironmentVariables` class wired via `ConfigModule.forRoot({ validate })` — fails
  fast at boot with one clear message instead of a random later crash. **Only
  `DATABASE_URL`/`JWT_SECRET`/`JWT_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN` are
  required** — `AWS_*`/`PUBLIC_SITE_URL`/`CORS_ORIGINS`/`THROTTLE_*` are all
  `@IsOptional()`, deliberately, carrying forward Step 12's lesson: `MediaService`
  reads the AWS vars lazily specifically so the app can boot without them, and making
  them "required" in a blanket env validator would silently undo that. Needed an
  explicit `import 'reflect-metadata'` in the validation file itself — the full Nest
  bootstrap loads that polyfill as a side effect, but a standalone unit test of the
  validator never triggers that chain, and `plainToInstance`'s implicit type
  conversion needs it directly.
- **Health check**: hand-rolled (not `@nestjs/terminus` — this app only needs "is the
  DB reachable," nothing else Terminus offers is meaningful here). `GET /health` pings
  the DB (`SELECT 1`), `@Public()` + `@SkipThrottle()`; throws a real `503` on failure
  (not a `200` with a "disconnected" field) so orchestrators actually see the instance
  as unhealthy.
- **Graceful shutdown**: `app.enableShutdownHooks()` in `main.ts` — without it, Nest
  never listens for `SIGTERM`/`SIGINT` at all, so `PrismaService`'s existing
  `OnModuleDestroy` (`$disconnect()`) was silently never firing.

## Roadmap (in order)

1. ✅ `POST /users` — bootstrap the first admin (DTO validation, duplicate-email check,
   bcrypt hash, auto-assigned `ADMIN` role, only works while the users table is empty).
2. ✅ Real `POST /auth/login` — find user → bcrypt compare → issue JWT → issue opaque
   refresh token (SHA-256 hash stored in `RefreshToken`) → update `lastLogin` → return
   both tokens.
3. ✅ Passport JWT strategy (`src/auth/strategies/jwt.strategy.ts`).
4. ✅ Global JWT auth guard + `@Public()` decorator (`src/auth/guards/jwt-auth.guard.ts`,
   `src/auth/decorators/public.decorator.ts`). New protected routes need no extra
   annotation; explicitly public ones need `@Public()`.
5. ✅ `GET /auth/me` (`src/auth/decorators/current-user.decorator.ts` extracts
   `req.user`, already populated by the guard/strategy).
6. ✅ `POST /auth/refresh` — rotates the refresh token (old row deleted, new pair
   issued) after verifying the stored hash, expiry, and that the user is still active.
7. ✅ `POST /auth/logout` — deletes the caller's specific refresh token.
8. ✅ RBAC: `PermissionsGuard` + `@Permissions(...)` decorator, checked against
   `RolePermission` grants. `users:*` catalog seeded; extend per-resource as each new
   step below adds real endpoints.
9. ✅ Users CRUD: list (pagination/search/sort)/get/patch/delete, soft delete,
   `@Permissions()`-gated.
10. ✅ Categories CRUD (unique slug, auto-generated + de-duplicated) and Tags CRUD —
    the many-to-many wiring with blogs (`BlogCategory`/`BlogTag`) itself happens in
    Step 11 when Blogs are built.
11. ✅ Blogs: full CRUD, public `GET /blogs/slug/:slug` (published-only, view count),
    `DRAFT/PUBLISHED/SCHEDULED/ARCHIVED` status workflow, versioning + rollback via
    `BlogVersion`.
12. ✅ Media module: S3 upload, return CloudFront URL — code + unit tests done; live
    AWS verification explicitly declined by the user (no real credentials), app
    confirmed to boot and run normally regardless (see Current Status above).
13. ✅ SEO: auto meta title/description + canonical URL on blog create (auto slug was
    already covered by Steps 10-11).
14. ✅ Dashboard stats: `GET /dashboard/stats` — totals + full blog-status breakdown.
15. ✅ Audit log: `@Audit()` decorator + global interceptor, `GET /audit`
    (`ADMIN`-only), covering exactly login/create/update/delete/publish/unpublish.
16. ✅ Production hardening: Helmet, CORS, compression, rate limiting (+ stricter
    login throttle), env validation (fail-fast, AWS/media vars deliberately still
    optional), real `GET /health` DB check, graceful shutdown.

**All 16 roadmap steps are now done.** Future work on this project is enhancement/
maintenance, not roadmap completion — re-read the rest of this file for the real
current state before assuming anything is still open.

## Working Conventions

- When implementing a feature: briefly state the architecture, then DTO → Controller →
  Service → Prisma integration → validation → Swagger decorators, following the
  structure above.
- Ensure the code compiles (`nest build` or `tsc`) before moving to the next feature.
- Comments only where the *why* is non-obvious; no tutorial-style narration in code.
