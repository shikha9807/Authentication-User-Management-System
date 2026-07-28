FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Install dependencies separately for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
