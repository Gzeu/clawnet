# Simplified Dockerfile for ClawNet API
FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/registry/package.json ./packages/registry/
COPY packages/message-bus/package.json ./packages/message-bus/
COPY packages/memory/package.json ./packages/memory/
COPY packages/api/package.json ./packages/api/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
RUN pnpm install --no-frozen-lockfile

# Copy source files
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/registry/src ./packages/registry/src
COPY packages/registry/tsconfig.json ./packages/registry/
COPY packages/message-bus/src ./packages/message-bus/src
COPY packages/message-bus/tsconfig.json ./packages/message-bus/
COPY packages/memory/src ./packages/memory/src
COPY packages/memory/tsconfig.json ./packages/memory/
COPY packages/api/src ./packages/api/src
COPY packages/api/tsconfig.json ./packages/api/

# Build
RUN pnpm --filter @clawnet/core build
RUN pnpm --filter @clawnet/registry build
RUN pnpm --filter @clawnet/message-bus build
RUN pnpm --filter @clawnet/memory build
RUN pnpm --filter @clawnet/api build

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start
CMD ["node", "packages/api/dist/index.js"]