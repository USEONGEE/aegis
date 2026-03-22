FROM node:20-alpine

WORKDIR /app

# ── package files (layer cache) ──────────────────────────────────────
COPY package.json package-lock.json ./
COPY packages/canonical/package.json  packages/canonical/package.json
COPY packages/protocol/package.json   packages/protocol/package.json
COPY packages/relay/package.json      packages/relay/package.json

# Strip workspaces that aren't needed (app has RN native deps)
RUN node -e "\
  const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));\
  p.workspaces=['packages/canonical','packages/protocol','packages/relay'];\
  require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"

RUN npm install

# ── source ───────────────────────────────────────────────────────────
COPY packages/canonical/ packages/canonical/
COPY packages/protocol/  packages/protocol/
COPY packages/relay/      packages/relay/

WORKDIR /app/packages/relay

EXPOSE 3000

CMD ["node", "--loader", "ts-node/esm", "src/index.ts"]
