# Build context is the repository root:
#   docker build -f apps/api/Dockerfile -t itt-api .

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# better-sqlite3 ships prebuilt binaries; the toolchain is only a fallback if one is missing.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api

COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
RUN npm --workspace apps/api run build \
 && npm prune --omit=dev --workspace apps/api


FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8000 \
    DATA_DIR=/data
WORKDIR /app

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json

# /data is where the Azure Files share is mounted. Mount it with uid=1000,gid=1000 so this user can write.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8000
CMD ["node", "dist/index.js"]
