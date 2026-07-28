# syntax=docker/dockerfile:1

##### Stage 1: build #####
FROM node:24-alpine AS builder

# Prisma's query engine needs openssl on alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

# npm ci was rejecting Windows-generated package-lock.json here (cross-platform
# optional-dependency drift, e.g. @emnapi/*); npm install reconciles instead of
# hard-failing, and still uses the lock file as its base.
RUN npm install

COPY . .

# Generates the Linux query engine for this container (a Windows-generated
# client from the host would not run here)
RUN npx prisma generate

RUN npm run build

##### Stage 2: runtime #####
FROM node:24-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node prisma.config.ts ./prisma.config.ts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main"]
