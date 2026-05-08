FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=::

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Tiles and maps are on a Fly volume mounted at /data.
# Create symlinks so Next.js serves them as static assets.
RUN ln -s /data/tiles ./public/tiles && \
    ln -s /data/maps ./public/maps

EXPOSE 3000
CMD ["node", "server.js"]
