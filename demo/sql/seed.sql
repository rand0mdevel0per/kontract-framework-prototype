-- Seed data — register the tasks table pointer
-- Run once: psql $DATABASE_URL -f sql/seed.sql

INSERT INTO storage (id, ptr, owner, permissions)
VALUES ('tasks', 'tbl_tasks_demo', 'demo-tenant', 7)
ON CONFLICT (id) DO NOTHING;
