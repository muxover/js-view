# The image tag must match the playwright version in package.json, or the
# bundled Chromium is the wrong build.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY .env.example ./.env.example

# Persisted session storage.
RUN mkdir -p /app/sessions
ENV SESSION_DIR=/app/sessions

EXPOSE 8080
CMD ["node", "dist/index.js"]
