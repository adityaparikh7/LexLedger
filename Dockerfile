# Cloud image: Express API + the built web app + headless Chrome for fee-memo PDFs.
# Build:  docker build -t lexledger .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=postgres://... lexledger

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix server
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client
COPY shared shared
COPY server server
COPY client client
RUN npm run build --prefix client && npm run build:cloud --prefix server

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    # Dashboard month/quarter/FY boundaries use the server's local date
    TZ=Asia/Kolkata \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
WORKDIR /app
COPY server/package.json server/package-lock.json server/
# Production dependencies, then Chrome with the system libraries it needs. Liberation Serif is
# metric-compatible with Times New Roman, which the memo template uses.
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm ci --prefix server --omit=dev \
 && cd server && npx puppeteer browsers install chrome --install-deps \
 && apt-get install -y --no-install-recommends fonts-liberation fonts-dejavu-core tzdata \
 && rm -rf /var/lib/apt/lists/* /root/.npm
COPY --from=build /app/server/dist-cloud server/dist-cloud
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/client/dist client/dist
RUN useradd --system --create-home lexledger && chown -R lexledger /app/.cache
USER lexledger
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist-cloud/index.js"]
