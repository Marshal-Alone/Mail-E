# Production Dockerfile for Mail-E
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Install dependencies (only production)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application source code and assets
COPY src/ ./src/
COPY public/ ./public/

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/status || exit 1

# Start Mail-E server with background monitor
CMD ["node", "src/server.js"]
