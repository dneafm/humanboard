# Stage 1: Build the Vite frontend
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY .env ./
COPY src/ ./src
COPY public/ ./public
COPY index.html ./
COPY tsconfig.json ./
COPY vite.config.ts ./
RUN npm run build:prod

# Stage 2: Production runtime environment
FROM node:22-bookworm-slim
# Install Python 3 (required by the SQLite python bridge)
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.mjs ./
COPY server/ ./server
COPY scripts/ ./scripts
COPY ai_era_kb.sqlite3 ./ai_era_kb.sqlite3

ENV PORT=8080
ENV HUMANBOARD_PORT=8080
ENV HUMANBOARD_HOST=0.0.0.0
ENV AI_ERA_KB_PATH=/app/ai_era_kb.sqlite3
ENV HUMANBOARD_USER_DATA_DIR=/app/data/users

EXPOSE 8080
CMD ["node", "server.mjs"]
