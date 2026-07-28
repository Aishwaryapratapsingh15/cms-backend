# Deployment Guide — CMS Backend (Docker + Nginx, Linux VPS)

## What's in this repo for deployment

- `Dockerfile` — multi-stage build (Node 24, Alpine). Builds the app, generates the
  Prisma client for Linux, and produces a slim runtime image that runs as a non-root
  user and runs DB migrations automatically on container start.
- `docker-entrypoint.sh` — runs `prisma migrate deploy`, then starts the app.
- `docker-compose.yml` — `postgres` (Postgres 16) + `app` services on an internal
  Docker network. The app container only binds to `127.0.0.1:3000` — it is **not**
  exposed to the internet directly; Nginx on the host is the public-facing reverse
  proxy.
- `.env.example` — template for the real `.env` file (never commit `.env`).
- `deploy/nginx/cms-backend.conf` — Nginx site config, proxies your domain to the
  app container.

This guide assumes Docker, Docker Compose, Nginx, and git are already installed on
the VPS.

---

## 1. Get the code onto the VPS

```bash
git clone <your-github-repo-url> cms-backend
cd cms-backend
```

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in at minimum:
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `DATABASE_URL` — must use host `postgres` (the compose service name), e.g.
  `postgresql://cms_user:YOUR_PASSWORD@postgres:5432/cms_db`
  (if your password has special characters like `@`, `:`, `/`, `%`, URL-encode them)
- `JWT_SECRET` — a long random string (`openssl rand -base64 48`)
- `CORS_ORIGINS` — your real frontend domain(s), comma-separated
- `AWS_*` — only if you're using S3 media uploads; safe to leave blank otherwise

## 3. Build and start

```bash
docker compose up -d --build
docker compose logs -f app     # watch migrations run + app boot
```

You should see `Running database migrations...` then Nest's startup log. Ctrl+C to
stop following logs (containers keep running).

## 4. Seed roles/permissions (first deploy only)

The DB starts empty — no `ADMIN`/`EDITOR`/`AUTHOR` roles or permissions exist yet.

```bash
docker compose exec app node dist/seed/seed.js
```

## 5. Bootstrap the first admin user

`POST /users` only works once, while the users table is empty:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Admin","email":"admin@example.com","password":"ChangeMe123!"}'
```

(Run this on the VPS itself, or through your domain once Nginx is set up below.)

## 6. Nginx reverse proxy

```bash
sudo cp deploy/nginx/cms-backend.conf /etc/nginx/sites-available/cms-backend.conf
sudo nano /etc/nginx/sites-available/cms-backend.conf   # replace api.yourdomain.com
sudo ln -s /etc/nginx/sites-available/cms-backend.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 7. HTTPS

```bash
sudo certbot --nginx -d api.yourdomain.com
```

Certbot edits the site config in place to add the SSL block and sets up auto-renewal.

## 8. Verify

```bash
curl https://api.yourdomain.com/api/v1/health
# {"success":true,"message":"Service is healthy","data":{"status":"ok",...}}
```

Swagger docs: `https://api.yourdomain.com/docs`

---

## Everyday operations

**Redeploy after pushing new code:**
```bash
git pull
docker compose up -d --build
```
(Migrations run automatically on the new container's start.)

**View logs:**
```bash
docker compose logs -f app
docker compose logs -f postgres
```

**Restart without rebuilding:**
```bash
docker compose restart app
```

**Stop everything:**
```bash
docker compose down
```
(Add `-v` only if you intentionally want to delete the Postgres volume/data —
this is destructive.)

**Run a one-off command inside the running app container:**
```bash
docker compose exec app sh
```

**Check container status:**
```bash
docker compose ps
```

**Manually run migrations (normally automatic on container start):**
```bash
docker compose exec app npx prisma migrate deploy
```

---

## Troubleshooting

- **App container keeps restarting** → `docker compose logs app`. Most common cause:
  bad `DATABASE_URL` (wrong host — must be `postgres`, not `localhost`) or a missing
  required env var (`JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`,
  `DATABASE_URL` are all required — the app fails fast at boot if any are missing,
  see `src/config/env.validation.ts`).
- **502 from Nginx** → app container isn't up yet or crashed; check
  `docker compose ps` and `docker compose logs app`.
- **`/health` returns 503** → Postgres is unreachable from the app container; check
  `docker compose logs postgres` and that both services are on the same
  `cms-internal` network (they are, by default, via `docker-compose.yml`).
- **Media upload 500s** → expected until real `AWS_*` credentials are set in `.env`;
  everything else in the API works without them.
