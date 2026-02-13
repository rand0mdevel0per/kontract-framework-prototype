-- Kontract required tables
-- Run once: psql $DATABASE_URL -f sql/init.sql

-- 1. Pointer table — maps logical names to physical tables
CREATE TABLE IF NOT EXISTS storage (
  id          TEXT PRIMARY KEY,
  ptr         TEXT NOT NULL,
  owner       TEXT NOT NULL,
  permissions INT  NOT NULL DEFAULT 7
);

-- 2. Transaction registry — tracks active sessions
CREATE TABLE IF NOT EXISTS trxs (
  sid         TEXT    PRIMARY KEY,
  owner       TEXT    NOT NULL,
  create_txid BIGINT  NOT NULL
);

-- 3. Demo data table — physical table for "tasks"
CREATE TABLE IF NOT EXISTS tbl_tasks_demo (
  id              TEXT PRIMARY KEY,
  data            JSONB NOT NULL DEFAULT '{}',
  _txid           BIGINT NOT NULL,
  _deleted_txid   BIGINT,
  _owner          TEXT NOT NULL,
  _order          SERIAL
);

CREATE INDEX IF NOT EXISTS idx_tasks_txid
  ON tbl_tasks_demo (_txid);
CREATE INDEX IF NOT EXISTS idx_tasks_owner
  ON tbl_tasks_demo (_owner);
