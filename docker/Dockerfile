# AeroPDF.dev self-hosted engine — multi-stage (bundle the app, ship a slim runtime)

# ---- builder: install + produce the single-file bundle ----
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY docs ./docs
COPY Specs.md proje.md ./
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm install --omit=optional --no-audit --no-fund \
 && npm run build:deploy

# ---- runtime: only the bundle, non-root ----
FROM node:22-slim AS runtime
RUN groupadd -r aeropdf && useradd -r -g aeropdf -m aeropdf
WORKDIR /app
COPY --from=builder /app/deploy ./

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STORAGE_DRIVER=local \
    STORAGE_PATH=/data \
    DASHBOARD_DIR=/app/public \
    ENABLE_HTML_PDF=off

RUN mkdir -p /data && chown -R aeropdf:aeropdf /app /data
USER aeropdf

EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "app.js"]
