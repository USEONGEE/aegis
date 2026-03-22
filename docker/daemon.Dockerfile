FROM node:20-alpine

# better-sqlite3 requires native build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# ── package files (layer cache) ──────────────────────────────────────
COPY package.json package-lock.json ./
COPY packages/canonical/package.json   packages/canonical/package.json
COPY packages/protocol/package.json    packages/protocol/package.json
COPY packages/guarded-wdk/package.json packages/guarded-wdk/package.json
COPY packages/manifest/package.json    packages/manifest/package.json
COPY packages/daemon/package.json      packages/daemon/package.json

# Strip workspaces that aren't needed (app has RN native deps)
RUN node -e "\
  const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));\
  p.workspaces=['packages/canonical','packages/protocol','packages/guarded-wdk','packages/manifest','packages/daemon'];\
  require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"

# Rewrite pnpm "workspace:*" refs to "*" so npm can resolve them
RUN find packages -name package.json -exec sed -i 's/"workspace:\*"/"*"/g' {} +

RUN npm install
RUN npm install -g tsx

# ── source ───────────────────────────────────────────────────────────
COPY packages/canonical/   packages/canonical/
COPY packages/protocol/    packages/protocol/
COPY packages/guarded-wdk/ packages/guarded-wdk/
COPY packages/manifest/    packages/manifest/
COPY packages/daemon/      packages/daemon/

WORKDIR /app/packages/daemon

CMD ["sh", "-c", "mkdir -p /root/.wdk/daemon-store && WDK_SOCKET_PATH=/tmp/daemon.sock exec tsx src/index.ts"]
