# syntax=docker/dockerfile:1
# Build from monorepo root: docker build -f backend-api/Dockerfile -t tharwa-api .
FROM node:22-alpine AS deps
WORKDIR /app/backend-api
COPY backend-api/package.json backend-api/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

FROM node:22-alpine AS build
WORKDIR /app/backend-api
COPY --from=deps /app/backend-api/node_modules ./node_modules
COPY backend-api/ .
RUN mkdir -p contracts
COPY specs/001-tharwa-platform-mvp/contracts/openapi.yaml ./contracts/openapi.yaml
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend-api/node_modules ./node_modules
COPY --from=build /app/backend-api/dist ./dist
COPY --from=build /app/backend-api/prisma ./prisma
COPY --from=build /app/backend-api/contracts ./contracts
COPY backend-api/package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
