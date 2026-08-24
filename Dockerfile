# Multi-stage Dockerfile for Smarter Home Pi Controller
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Runner stage
FROM node:20-bullseye-slim AS runner

WORKDIR /app

# Install runtime camera & video utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    v4l-utils \
    fswebcam \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Persistent data directory for sensor config & enrolled faces
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 4000

CMD ["node", "dist/index.js"]
