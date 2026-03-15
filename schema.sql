-- Ponniyin Selvan Card Game: Multiplayer Schema
-- Run this in your Neon console before deploying

CREATE TABLE IF NOT EXISTS rooms (
  code          CHAR(6) PRIMARY KEY,
  host_player_id TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'LOBBY',
  include_expansion BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '4 hours'
);

CREATE TABLE IF NOT EXISTS room_players (
  id            TEXT PRIMARY KEY,
  room_code     CHAR(6) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  seat_index    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  is_ready      BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_code, seat_index)
);

CREATE TABLE IF NOT EXISTS game_states (
  room_code     CHAR(6) PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
  state_json    JSONB NOT NULL,
  version       INTEGER NOT NULL DEFAULT 0,
  response_deadline TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
