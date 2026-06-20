# Playwright base image ships Chromium + all required system libraries.
FROM mcr.microsoft.com/playwright:v1.46.0-jammy AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ---- build ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY .env.example ./.env.example

# Persisted session storage.
RUN mkdir -p /app/sessions
ENV SESSION_DIR=/app/sessions

EXPOSE 8080
CMD ["node", "dist/index.js"]
