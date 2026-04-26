FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY shared/ ./shared/
COPY bot/ ./bot/
COPY config.ts ./

RUN mkdir -p /app/data

EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3456/health || exit 1

CMD ["npx", "tsx", "bot/index.ts"]
