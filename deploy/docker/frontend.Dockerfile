FROM node:22-slim AS builder
WORKDIR /app

# Build the shared query-match-core package first — frontend depends on it via a file:
# reference (deploy/docker/*.Dockerfile build each service standalone, so this isn't
# a published registry package; it must be built and present on disk before frontend's
# own `npm install` resolves its dependency tree).
COPY packages/query-match-core/package*.json packages/query-match-core/
COPY packages/query-match-core/tsconfig.json packages/query-match-core/
COPY packages/query-match-core/src packages/query-match-core/src
RUN npm --prefix packages/query-match-core ci || npm --prefix packages/query-match-core install
RUN npm --prefix packages/query-match-core run build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
ARG VITE_BFF_BASE_URL=BACKEND-URL-PLACEHOLDER-Bff
ENV VITE_BFF_BASE_URL=${VITE_BFF_BASE_URL}
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/frontend/ado-extension/dist /usr/share/nginx/html
COPY --from=builder /app/frontend/ado-extension/vss-extension.json /opt/ado-extension/vss-extension.json
COPY --from=builder /app/frontend/ado-extension/dist /opt/ado-extension/dist
COPY --from=builder /app/frontend/src/deployment /tmp/deployment
RUN chmod +x /tmp/deployment/*.sh
EXPOSE 80
ENTRYPOINT ["/bin/sh","/tmp/deployment/env-uri-init.sh"]
