# syntax=docker/dockerfile:1
#
# AirHouse production image.
#
# One container serves both the built single-page application and the
# notification API, because `server/index.js` serves `dist/` when NODE_ENV is
# production. That keeps the deployment to a single process behind your
# existing Nginx.
#
# IMPORTANT -- Vite variables are BUILD-time, not run-time.
# Anything prefixed VITE_ is baked into the JavaScript bundle during
# `npm run build`. Setting it in docker-compose `environment:` has no effect
# on the frontend; it must be passed as a build argument. That is why they
# appear as ARG below. Server-side secrets (service role key, Resend key) are
# the opposite: they must NEVER be build arguments, because build arguments
# are readable in the image history. Those arrive at runtime only.

# ---------------------------------------------------------------------------
# Stage 1 — build the frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile moves.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Public configuration, baked into the bundle.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ENVIRONMENT=production
ARG VITE_RELEASE=unknown
ARG VITE_SENTRY_DSN=
ARG VITE_PAYMENT_GATEWAY=test
ARG VITE_BANK_ACCOUNT_NAME=
ARG VITE_BANK_NAME=
ARG VITE_BANK_ACCOUNT_NUMBER=
ARG VITE_BANK_BRANCH_CODE=

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ENVIRONMENT=$VITE_ENVIRONMENT \
    VITE_RELEASE=$VITE_RELEASE \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_PAYMENT_GATEWAY=$VITE_PAYMENT_GATEWAY \
    VITE_BANK_ACCOUNT_NAME=$VITE_BANK_ACCOUNT_NAME \
    VITE_BANK_NAME=$VITE_BANK_NAME \
    VITE_BANK_ACCOUNT_NUMBER=$VITE_BANK_ACCOUNT_NUMBER \
    VITE_BANK_BRANCH_CODE=$VITE_BANK_BRANCH_CODE

# supabase.js throws when the URL or key is absent, so a misconfigured build
# fails here rather than shipping an image that cannot talk to its backend.
RUN test -n "$VITE_SUPABASE_URL" || (echo "VITE_SUPABASE_URL build arg is required" && exit 1)
RUN test -n "$VITE_SUPABASE_ANON_KEY" || (echo "VITE_SUPABASE_ANON_KEY build arg is required" && exit 1)

RUN npm run build

# Drop the build-only dependencies from this same tree, so the runtime stage
# can copy it rather than running a second install. BuildKit runs stages in
# parallel, and two concurrent npm installs on a small box is enough to make
# npm fall over with "Exit handler never called".
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# No extra packages are installed. The health check is a Node one-liner using
# the built-in fetch, and signal handling comes from compose's `init: true`
# rather than tini, which keeps the image small and means the build does not
# depend on reaching a package mirror.
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only; the build toolchain does not ship.
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules

COPY server ./server
COPY --from=build /app/dist ./dist

# Run unprivileged. The node image already provides this user.
USER node

EXPOSE 5000

# Docker restarts the container if this fails repeatedly, and the compose file
# waits on it before reporting the service healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
