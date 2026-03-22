#!/bin/sh
set -e

# Install WDK plugin if not already installed
if [ ! -d "$HOME/.openclaw/extensions/wdk-tools" ]; then
  echo "[entrypoint] Installing WDK tools plugin..."
  openclaw plugins install /opt/wdk-plugin 2>/dev/null || true
fi

# Enable /v1/responses HTTP endpoint
openclaw config set gateway.http.endpoints.responses.enabled true 2>/dev/null || true

# Create daemon agent with minimal tools profile + WDK tools allowed (if not exists)
if ! openclaw agents list 2>/dev/null | grep -q "daemon"; then
  echo "[entrypoint] Creating daemon agent..."
  openclaw agents add daemon --non-interactive --workspace "$HOME/.openclaw/workspace-daemon" --model anthropic/claude-haiku-4-5 2>/dev/null || true
fi

# Configure daemon agent: deny built-in + allow WDK tools only
node -e '
const fs = require("fs");
const cfgPath = process.env.HOME + "/.openclaw/openclaw.json";
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const daemon = cfg.agents.list.find(a => a.id === "daemon");
if (daemon) {
  daemon.tools = {
    profile: "full",
    deny: ["group:openclaw"],
    allow: [
      "session_status",
      "sendTransaction", "getBalance", "getWalletAddress", "signTransaction",
      "policyList", "policyPending", "policyRequest", "listRejections", "listPolicyVersions",
      "registerCron", "listCrons", "removeCron",
      "erc20Transfer", "erc20Approve", "hyperlendDepositUsdt"
    ]
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log("[entrypoint] daemon agent tools configured");
}
'

# Copy workspace bootstrap files (SOUL.md, TOOLS.md) for system prompt injection
WORKSPACE="$HOME/.openclaw/workspace-daemon"
mkdir -p "$WORKSPACE"
cp /opt/wdk-plugin/workspace/SOUL.md "$WORKSPACE/SOUL.md" 2>/dev/null || true
cp /opt/wdk-plugin/workspace/TOOLS.md "$WORKSPACE/TOOLS.md" 2>/dev/null || true
echo "[entrypoint] workspace bootstrap files copied"

# Start gateway (pass through CMD from docker-compose)
exec "$@"
