# ADO Hierarchy Viewer

Live, interactive replacement for the PowerShell ADO backlog hierarchy report. Connects to Azure DevOps Server in real time to visualize work item link hierarchies with progress tracking and effort rollups.

## Architecture

Three deployment modes from one codebase:

| Mode | Description |
|---|---|
| ADO Extension | Embedded hub in Azure DevOps (SDK auth) |
| Standalone Web | Hosted separately, PAT login |
| Containerized | Docker/Kubernetes with nginx + Express BFF |

### Stack

- **Frontend:** React 19, Vite 7, MUI v7, Zustand, react-virtuoso, TypeScript strict
- **BFF:** Express 4, TypeScript, Zod, pino, lru-cache
- **Extension SDK:** azure-devops-extension-sdk v4 (RequireJS)

## Prerequisites

- Node.js 22+
- Docker (for containers)
- tfx-cli (for extension packaging): `npm install -g tfx-cli`

## Local Development

### Setup
```bash
cd ado-hierarchy-viewer
npm install        # installs all workspace deps
```

### Run frontend dev server (port 5174)
```bash
cd frontend
npm run dev
```

### Run BFF dev server (port 8080)
```bash
cd bff
npm run dev
```

### Run with Docker Compose (recommended)
```bash
cd deploy/compose
docker-compose up -d
# Frontend: http://localhost:4080
# BFF API:  http://localhost:8080
```

## Build

```bash
# Frontend (produces ado-extension/dist/)
cd frontend && npm run build

# BFF (produces bff/dist/)
cd bff && npm run build
```

## Tests

```bash
cd frontend && npm test      # 71 Vitest tests
cd bff && npm test           # 68 Jest tests, coverage thresholds
```

## Extension Packaging

1. Build the frontend: `cd frontend && npm run build`
2. Start the frontend container (so we can copy the built dist)
3. Run: `./frontend/src/deployment/build-extension-from-container.sh <container-id> <bff-url>`
4. The .vsix is output to `frontend/vsix-out/`

Or use the VSIX builder image:
```bash
docker build -f frontend/src/deployment/dockerfile.vsix-builder -t vsix-builder .
docker run --rm \
  -v $(pwd)/frontend/ado-extension/dist:/work/dist \
  -v $(pwd)/frontend/ado-extension:/work \
  -v $(pwd)/frontend/vsix-out:/opt/ado-extension/out \
  vsix-builder
```

## Kubernetes Deployment

```bash
# Dev
helm upgrade --install ado-hierarchy-viewer \
  deploy/helm/ado-hierarchy-viewer \
  -n ado-hierarchy-viewer --create-namespace \
  -f deploy/helm/ado-hierarchy-viewer/values-dev.yaml \
  --set bff.image.tag=<build-id> \
  --set frontend.image.tag=<build-id>

# Prod
helm upgrade --install ado-hierarchy-viewer \
  deploy/helm/ado-hierarchy-viewer \
  -n ado-hierarchy-viewer \
  -f deploy/helm/ado-hierarchy-viewer/values-prod.yaml \
  --set bff.image.tag=<build-id> \
  --set frontend.image.tag=<build-id> \
  --set bff.secret.bffApiKey=<key>
```

## Configuration

### BFF environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 8080 | Listen port |
| `CORS_ALLOWED_ORIGINS` | (all) | Comma-separated origins |
| `ADO_API_VERSION` | 7.1 | ADO REST API version (fallback: 5.1, none) |
| `ADO_REQUEST_TIMEOUT_MS` | 30000 | ADO call timeout |
| `CACHE_TTL_MS` | 30000 | Short-TTL in-memory cache (PAT excluded from keys) |
| `BFF_API_KEY` | (none) | Optional >=16-char API key for `X-Api-Key` header |
| `LOG_LEVEL` | info | pino log level |

### Frontend (nginx runtime)

`BFF_URL` environment variable is injected as `window.APP_CONFIG.BFF_URL` at container start by `env-uri-init.sh`.

## Security Notes

- PAT/bearer tokens are forwarded per-request via `X-Ado-PAT` header; never stored server-side
- On-prem ADO Server: BFF disables TLS verification (`rejectUnauthorized: false`) for self-signed certs
- Cache keys exclude PAT; cached values contain only ADO response data (no credentials)
- Optional `BFF_API_KEY` (>=16 chars) with constant-time comparison protects the BFF in containerized mode

## CI/CD

Uses Azure DevOps Pipelines (`azure-pipelines.yml`). Stages:
1. Build & Test (frontend + BFF)
2. Docker build & push to ACR
3. VSIX packaging
4. Helm deploy to dev (auto) / prod (manual approval)
