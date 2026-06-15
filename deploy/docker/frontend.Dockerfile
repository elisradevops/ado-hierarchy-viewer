FROM node:22-slim AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
ARG VITE_BFF_BASE_URL=BACKEND-URL-PLACEHOLDER-Bff
ENV VITE_BFF_BASE_URL=${VITE_BFF_BASE_URL}
RUN npm run build

FROM nginx:alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/ado-extension/dist /usr/share/nginx/html
COPY --from=builder /app/ado-extension/vss-extension.json /opt/ado-extension/vss-extension.json
COPY --from=builder /app/ado-extension/dist /opt/ado-extension/dist
COPY --from=builder /app/src/deployment /tmp/deployment
RUN chmod +x /tmp/deployment/*.sh
EXPOSE 80
ENTRYPOINT ["/bin/sh","/tmp/deployment/env-uri-init.sh"]
