FROM node:22-slim AS build
WORKDIR /app/bff
COPY bff/package*.json ./
RUN npm ci || npm install
COPY bff/ ./
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/bff/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/bff/dist ./dist
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","dist/server.js"]
