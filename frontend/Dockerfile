FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build for production — API calls go to same origin (nginx proxies)
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

# ── Production runner ──
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
