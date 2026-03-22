FROM ghcr.io/openclaw/openclaw:latest

# Copy WDK plugin source
COPY packages/openclaw-plugin /opt/wdk-plugin

# Install plugin dependencies
RUN cd /opt/wdk-plugin && npm install --omit=dev 2>/dev/null || true

# Startup script: install plugin + configure + start gateway
COPY --chmod=755 docker/openclaw-entrypoint.sh /opt/openclaw-entrypoint.sh

ENTRYPOINT ["/opt/openclaw-entrypoint.sh"]
