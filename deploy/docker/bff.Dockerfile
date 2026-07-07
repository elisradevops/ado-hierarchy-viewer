FROM node:22-slim AS build
WORKDIR /app

# Build the shared query-match-core package first — bff depends on it via a file:
# reference (deploy/docker/*.Dockerfile build each service standalone, so this isn't
# a published registry package; it must be built and present on disk before bff's
# own `npm install` resolves its dependency tree).
COPY packages/query-match-core/package*.json packages/query-match-core/
COPY packages/query-match-core/tsconfig.json packages/query-match-core/
COPY packages/query-match-core/src packages/query-match-core/src
RUN npm --prefix packages/query-match-core ci || npm --prefix packages/query-match-core install
RUN npm --prefix packages/query-match-core run build

WORKDIR /app/bff
COPY bff/package*.json ./
RUN npm ci || npm install
COPY bff/ ./
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/query-match-core/package.json packages/query-match-core/package.json
COPY --from=build /app/packages/query-match-core/dist packages/query-match-core/dist
WORKDIR /app/bff
COPY --from=build /app/bff/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/bff/dist ./dist
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","dist/server.js"]
