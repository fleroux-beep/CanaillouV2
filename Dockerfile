# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Prune dev dependencies in-place so we can copy production node_modules
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/index.mjs"]
