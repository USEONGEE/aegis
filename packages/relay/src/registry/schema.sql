-- WDK Relay PostgreSQL schema
-- Executed automatically on first docker-compose up via initdb.d

BEGIN;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices (routing only — security decisions live in daemon)
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('daemon', 'app')),
  push_token    TEXT,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

COMMIT;
