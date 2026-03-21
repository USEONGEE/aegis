-- WDK Relay PostgreSQL schema
-- Executed automatically on first docker-compose up via initdb.d

BEGIN;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  password_hash TEXT,       -- NULL for OAuth users
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

-- Daemons (independent entity — 1 daemon serves N users)
CREATE TABLE IF NOT EXISTS daemons (
  id            TEXT        PRIMARY KEY,
  secret_hash   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daemon-User mapping (N users : 1 daemon)
CREATE TABLE IF NOT EXISTS daemon_users (
  daemon_id     TEXT        NOT NULL REFERENCES daemons(id) ON DELETE CASCADE,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bound_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (daemon_id, user_id),
  UNIQUE (user_id)  -- 1 user : 1 daemon enforced
);

CREATE INDEX IF NOT EXISTS idx_daemon_users_daemon_id ON daemon_users(daemon_id);

-- Refresh tokens (daemon + app shared)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            TEXT        PRIMARY KEY,
  subject_id    TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('daemon', 'app')),
  device_id     TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_subject ON refresh_tokens(subject_id, role);

-- Enrollment codes (short-lived, single-use)
CREATE TABLE IF NOT EXISTS enrollment_codes (
  code          TEXT        PRIMARY KEY,
  daemon_id     TEXT        NOT NULL REFERENCES daemons(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ
);

COMMIT;
